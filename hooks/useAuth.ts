import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

interface AuthState {
    user: any | null;
    role: string | null;
    loading: boolean;
    error: Error | null;
}

// 권한 캐시 (메모리 + sessionStorage 이중 저장)
let authCache: {
    user: any | null;
    role: string | null;
    timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시
const AUTH_CACHE_KEY = 'app:auth:cache';

// sessionStorage에서 캐시 복원 (새로고침 시 인메모리 캐시 소실 방지)
function restoreCache() {
    if (authCache) return;
    try {
        const stored = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
            authCache = parsed;
        } else {
            sessionStorage.removeItem(AUTH_CACHE_KEY);
        }
    } catch { /* SSR 안전 */ }
}

function persistCache() {
    if (!authCache) return;
    try {
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authCache));
    } catch { /* SSR 안전 */ }
}

/**
 * 인증 및 권한 확인 커스텀 훅
 * @param requiredRoles - 필요한 역할 배열 (예: ['manager', 'admin'])
 * @param redirectOnFail - 권한 없을 시 리다이렉트할 경로
 */
export function useAuth(requiredRoles?: string[], redirectOnFail: string = '/login') {
    const router = useRouter();
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        role: null,
        loading: true,
        error: null
    });

    useEffect(() => {
        let cancelled = false;

        const doCheckAuth = async () => {
            try {
                // 0. sessionStorage에서 캐시 복원 시도
                restoreCache();

                // 1. 캐시 확인 (5분 이내)
                const now = Date.now();
                if (authCache && (now - authCache.timestamp) < CACHE_DURATION) {
                    console.log('✅ 캐시된 권한 사용:', authCache.role);
                    if (!cancelled) {
                        setAuthState({
                            user: authCache.user,
                            role: authCache.role,
                            loading: false,
                            error: null
                        });
                    }

                    // 권한 체크
                    if (requiredRoles && authCache.role && !requiredRoles.includes(authCache.role)) {
                        console.warn('⚠️ 권한 부족 (캐시):', authCache.role);
                        router.push(redirectOnFail);
                    }
                    return;
                }

                // 2. Supabase 인증 확인
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (cancelled) return;

                if (userError || !user) {
                    if (userError && isInvalidRefreshTokenError(userError)) {
                        await clearInvalidSession();
                    }
                    console.log('❌ 인증 실패:', userError?.message);
                    setAuthState({ user: null, role: null, loading: false, error: userError });
                    // requiredRoles가 있을 때만 리디렉션 (권한이 필요한 페이지에서만)
                    if (requiredRoles && requiredRoles.length > 0) {
                        router.push('/login');
                    }
                    return;
                }

                // 3. 사용자 역할 조회
                const { data: userData, error: roleError } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle(); // single 대신 maybeSingle 사용 (견적자는 users 테이블에 없을 수 있음)

                if (cancelled) return;

                let userRole = 'guest'; // 기본값

                if (!roleError && userData?.role) {
                    userRole = userData.role;
                } else if (roleError) {
                    console.warn('⚠️ 역할 조회 실패 (guest로 간주):', roleError.message);
                } else {
                    console.log('ℹ️ users 테이블에 없음 (guest)');
                }

                // 4. 캐시 업데이트 (메모리 + sessionStorage)
                authCache = {
                    user,
                    role: userRole,
                    timestamp: now
                };
                persistCache();

                console.log('✅ 인증 완료:', { email: user.email, role: userRole });

                // 5. 상태 업데이트
                if (!cancelled) {
                    setAuthState({
                        user,
                        role: userRole,
                        loading: false,
                        error: null
                    });
                }

                // 6. 권한 체크
                if (requiredRoles && !requiredRoles.includes(userRole)) {
                    console.warn('⚠️ 권한 부족:', { required: requiredRoles, actual: userRole });
                    alert('접근 권한이 없습니다.');
                    router.push(redirectOnFail);
                }

            } catch (error) {
                if (isInvalidRefreshTokenError(error)) {
                    await clearInvalidSession();
                }
                console.error('❌ 인증 확인 오류:', error);
                if (!cancelled) {
                    setAuthState({
                        user: null,
                        role: null,
                        loading: false,
                        error: error as Error
                    });
                }
                // requiredRoles가 있을 때만 리디렉션
                if (requiredRoles && requiredRoles.length > 0) {
                    router.push('/login');
                }
            }
        };

        doCheckAuth();
        return () => { cancelled = true; };
    }, []);

    // 캐시 무효화 및 재인증 함수
    const invalidateCache = async () => {
        authCache = null;
        try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch { /* SSR 안전 */ }
        setAuthState(prev => ({ ...prev, loading: true }));

        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                if (userError && isInvalidRefreshTokenError(userError)) {
                    await clearInvalidSession();
                }
                setAuthState({ user: null, role: null, loading: false, error: userError });
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();

            const userRole = userData?.role || 'guest';
            authCache = { user, role: userRole, timestamp: Date.now() };
            persistCache();
            setAuthState({ user, role: userRole, loading: false, error: null });
        } catch (error) {
            if (isInvalidRefreshTokenError(error)) {
                await clearInvalidSession();
            }
            setAuthState({ user: null, role: null, loading: false, error: error as Error });
        }
    };

    return {
        ...authState,
        isAuthenticated: !!authState.user,
        isManager: authState.role === 'manager' || authState.role === 'admin',
        isAdmin: authState.role === 'admin',
        isMember: authState.role === 'member',
        isGuest: authState.role === 'guest',
        refetch: invalidateCache
    };
}

/**
 * 캐시 수동 무효화 (로그아웃 시 사용)
 */
export function clearAuthCache() {
    authCache = null;
    try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch { /* SSR 안전 */ }
    console.log('🗑️ 인증 캐시 삭제');
}
