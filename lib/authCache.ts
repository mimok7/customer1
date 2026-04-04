/**
 * 인증 세션 캐시
 * getUser() 호출을 최소화하여 성능 향상
 */

interface CachedSession {
    user: any;
    orderId?: string | null;
    timestamp: number;
}

let sessionCache: CachedSession | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시
const SESSION_CACHE_KEY = 'app:session:cache';

// sessionStorage에서 복원 (새로고침 시 캐시 유지)
function restoreSessionCache() {
    if (sessionCache) return;
    try {
        const stored = sessionStorage.getItem(SESSION_CACHE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
            sessionCache = parsed;
        } else {
            sessionStorage.removeItem(SESSION_CACHE_KEY);
        }
    } catch { /* SSR 안전 */ }
}

function persistSessionCache() {
    if (!sessionCache) return;
    try {
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessionCache));
    } catch { /* SSR 안전 */ }
}

/**
 * 캐시된 사용자 세션 가져오기
 */
export function getCachedUser(): any | null {
    if (!sessionCache) restoreSessionCache();
    if (!sessionCache) return null;

    const now = Date.now();
    if (now - sessionCache.timestamp > CACHE_DURATION) {
        sessionCache = null;
        try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* SSR */ }
        return null;
    }

    return sessionCache.user;
}

/**
 * 사용자 세션 캐시 저장
 */
export function setCachedUser(user: any, orderId?: string | null): void {
    sessionCache = {
        user,
        orderId,
        timestamp: Date.now()
    };
    persistSessionCache();
}

/**
 * 캐시된 order_id 가져오기
 */
export function getCachedOrderId(): string | null | undefined {
    if (!sessionCache) restoreSessionCache();
    if (!sessionCache) return undefined;

    const now = Date.now();
    if (now - sessionCache.timestamp > CACHE_DURATION) {
        sessionCache = null;
        try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* SSR */ }
        return undefined;
    }

    return sessionCache.orderId;
}

/**
 * 캐시 무효화 (로그아웃 시 사용)
 */
export function clearCachedUser(): void {
    sessionCache = null;
    try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* SSR */ }
}

/**
 * 캐시 여부 확인
 */
export function hasCachedUser(): boolean {
    if (!sessionCache) restoreSessionCache();
    if (!sessionCache) return false;

    const now = Date.now();
    return (now - sessionCache.timestamp) <= CACHE_DURATION;
}
