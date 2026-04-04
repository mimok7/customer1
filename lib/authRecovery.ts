import supabase from './supabase';

export function isInvalidRefreshTokenError(error: unknown): boolean {
    const message =
        (error as { message?: string } | null)?.message ||
        (typeof error === 'string' ? error : '');

    return /Invalid Refresh Token|Refresh Token Not Found|refresh token/i.test(message);
}

export async function clearInvalidSession(): Promise<void> {
    try {
        await (supabase.auth as any).signOut({ scope: 'local' });
    } catch {
        try {
            await supabase.auth.signOut();
        } catch {
            // no-op
        }
    }

    if (typeof window === 'undefined') return;

    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // no-op
    }
}