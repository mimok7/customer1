import supabase from './supabase';

// --- Lightweight role cache (per-tab + cookie) ----------------------------
const ROLE_CACHE_KEY = 'app:user:role';
const ROLE_COOKIE_KEY = 'role';
const USER_INFO_CACHE_KEY = 'app:user:info';
const USER_INFO_TTL_MS = 1000 * 60 * 3;

interface CachedUserInfo {
  id: string;
  email: string;
  userData: any;
  cachedAt: number;
}

// Simple cookie helpers (client-side only)
const setCookie = (name: string, value: string, minutes = 30) => {
  try {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  } catch { /* noop */ }
};

const getCookie = (name: string): string | null => {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch { return null; }
};

export const getCachedRole = (): 'guest' | 'member' | 'manager' | 'admin' | null => {
  try {
    if (typeof window === 'undefined') return null;
    // 1) Session cache first (fastest)
    const v = window.sessionStorage.getItem(ROLE_CACHE_KEY);
    if (!v) return null;
    if (v === 'guest' || v === 'member' || v === 'manager' || v === 'admin') return v;
    return null;
  } catch { return null; }
};

export const setCachedRole = (role: string | null | undefined) => {
  try {
    if (typeof window === 'undefined') return;
    if (!role) {
      window.sessionStorage.removeItem(ROLE_CACHE_KEY);
      setCookie(ROLE_COOKIE_KEY, '', -1);
      return;
    }
    window.sessionStorage.setItem(ROLE_CACHE_KEY, role);
    // Also persist briefly in cookie to reuse across tabs for a short time
    setCookie(ROLE_COOKIE_KEY, role, 30);
  } catch { }
};

export const clearCachedRole = () => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(ROLE_CACHE_KEY);
    setCookie(ROLE_COOKIE_KEY, '', -1);
  } catch { }
};

export const getCachedCurrentUserInfo = (userId?: string | null, email?: string | null) => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(USER_INFO_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedUserInfo;
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > USER_INFO_TTL_MS) {
      window.sessionStorage.removeItem(USER_INFO_CACHE_KEY);
      return null;
    }

    if (userId && parsed.id !== userId) return null;
    if (email && parsed.email !== email) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setCachedCurrentUserInfo = (user: { id: string; email?: string | null } | null, userData: any) => {
  try {
    if (typeof window === 'undefined') return;
    if (!user?.id) {
      window.sessionStorage.removeItem(USER_INFO_CACHE_KEY);
      return;
    }

    const payload: CachedUserInfo = {
      id: user.id,
      email: user.email || '',
      userData: userData || null,
      cachedAt: Date.now(),
    };
    window.sessionStorage.setItem(USER_INFO_CACHE_KEY, JSON.stringify(payload));
  } catch { }
};

export const clearCachedCurrentUserInfo = () => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(USER_INFO_CACHE_KEY);
  } catch { }
};

// Secondary cookie-based role retrieval (cross-tab). Returns null if invalid.
export const getCookieRole = (): 'guest' | 'member' | 'manager' | 'admin' | null => {
  const v = getCookie(ROLE_COOKIE_KEY);
  if (v === 'guest' || v === 'member' || v === 'manager' || v === 'admin') return v;
  return null;
};

// 사용자 프로필 생성/업데이트 함수 (역할은 신중하게 다룸)
export const upsertUserProfile = async (
  userId: string,
  email: string,
  additionalData: {
    name?: string;
    english_name?: string;
    phone_number?: string;
    role?: string; // 역할 업데이트는 이 함수에서 직접 하지 않도록 유도
  } = {}
) => {
  try {
    // 1. 기존 사용자 정보 조회 (ID 또는 Email로)
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('사용자 정보 조회 오류:', fetchError);
      // 이메일 중복 확인 생략 (성능 최적화)
    }

    // 2. 업데이트할 데이터 준비
    const updateData: any = {
      id: userId,
      email: email,
      updated_at: new Date().toISOString(),
    };

    // 추가 정보가 있으면 병합
    if (additionalData.name) updateData.name = additionalData.name;
    if (additionalData.english_name) updateData.english_name = additionalData.english_name;
    if (additionalData.phone_number) updateData.phone_number = additionalData.phone_number;

    // 3. 역할(role) 처리
    // 기존 사용자가 있으면 역할을 변경하지 않음
    // 새 사용자이거나, 역할이 명시적으로 제공된 경우에만 설정
    if (existingUser) {
      // 기존 역할 유지
      updateData.role = existingUser.role;
      console.log('ℹ️  기존 사용자 업데이트:', existingUser.id);
    } else {
      // 새 사용자: 제공된 역할 또는 'guest'
      updateData.role = additionalData.role || 'guest';
      updateData.status = 'active';
      updateData.created_at = new Date().toISOString();
      console.log('ℹ️  신규 사용자 생성:', userId);
    }

    // 4. Upsert 실행 (id를 기준으로)
    const { error } = await supabase
      .from('users')
      .upsert(updateData, {
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ 사용자 프로필 생성/업데이트 실패:', error);

      // 이메일 중복 오류 처리
      if (error.message?.includes('users_email_key') || error.code === '23505') {
        return {
          success: false,
          error: {
            ...error,
            message: '이미 사용 중인 이메일입니다. 비밀번호 재설정을 이용하거나 다른 이메일로 가입해주세요.',
            code: 'EMAIL_DUPLICATE'
          }
        };
      }

      return { success: false, error };
    }

    console.log('✅ 사용자 프로필 생성/업데이트 성공');
    return { success: true, error: null };
  } catch (error: any) {
    console.error('❌ upsertUserProfile 오류:', error);

    // 이메일 중복 예외 처리
    if (error?.message?.includes('users_email_key') || error?.code === '23505') {
      return {
        success: false,
        error: {
          ...error,
          message: '이미 사용 중인 이메일입니다.',
          code: 'EMAIL_DUPLICATE'
        }
      };
    }

    return { success: false, error };
  }
};

// 현재 사용자 정보 가져오기 (인증 정보 + DB 정보)
export const getCurrentUserInfo = async () => {
  try {
    // 1. 인증된 사용자 정보 가져오기
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      clearCachedCurrentUserInfo();
      return { user: null, userData: null, error: authError };
    }

    const cachedUserInfo = getCachedCurrentUserInfo(authData.user.id, authData.user.email || '');
    if (cachedUserInfo) {
      return {
        user: authData.user,
        userData: cachedUserInfo.userData,
        error: null,
      };
    }

    // 2. DB에서 사용자 추가 정보 가져오기
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('id, email, name, english_name, phone_number, role, created_at, updated_at')
      .eq('id', authData.user.id)
      .single();

    if (dbError) {
      console.error('사용자 DB 정보 조회 실패:', dbError);
      // DB 정보가 없어도 인증 정보는 반환
      setCachedCurrentUserInfo(authData.user, null);
      return {
        user: authData.user,
        userData: null,
        error: dbError,
      };
    }

    setCachedCurrentUserInfo(authData.user, userData);

    return {
      user: authData.user,
      userData,
      error: null,
    };
  } catch (error) {
    console.error('getCurrentUserInfo 오류:', error);
    return { user: null, userData: null, error };
  }
};

// 사용자 표시명 가져오기 (우선순위: name > user_metadata.name > email 앞부분 > '사용자')
export const getUserDisplayName = (user: any, userData: any) => {
  if (userData?.name) {
    return userData.name;
  }

  if (user?.user_metadata?.name) {
    return user.user_metadata.name;
  }

  if (user?.email) {
    return user.email.split('@')[0];
  }

  return '사용자';
};

// 사용자가 관리자인지 확인
export const isAdmin = (userData: any) => {
  return userData?.role === 'admin';
};

// 인증 상태 변경 리스너 설정
export const setupAuthListener = (onUserChange: (user: any, userData: any) => void) => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
    // Debug: emit auth events for visibility in console
    try { console.debug('[auth event]', event); } catch { }

    // Sign-out or explicit user deletion -> clear app user
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      clearCachedRole();
      clearCachedCurrentUserInfo();
      onUserChange(null, null);
      return;
    }

    // Successful sign-in or token refresh -> refresh current user info
    if ((event === 'SIGNED_IN' && session?.user) || event === 'TOKEN_REFRESHED') {
      try {
        const { user, userData } = await getCurrentUserInfo();
        if (userData?.role) setCachedRole(userData.role);
        onUserChange(user, userData);
      } catch (err) {
        console.error('Auth listener: failed to refresh user info', err);
        clearCachedRole();
        clearCachedCurrentUserInfo();
        onUserChange(null, null);
      }
      return;
    }

    // Token refresh failure: token invalid/expired/rotated -> clear local state
    // Don't force signOut immediately – let the user retry on their next action
    if (event === 'TOKEN_REFRESH_FAILED') {
      console.warn('Auth listener: token refresh failed, clearing cache');
      clearCachedRole();
      clearCachedCurrentUserInfo();
      onUserChange(null, null);
      return;
    }
  });

  return subscription;
};
