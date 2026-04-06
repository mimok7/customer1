import supabase from './supabase';

/**
 * Get user from local session without a network request.
 * Falls back to getUser() with a timeout if no local session.
 */
export async function getSessionUser(timeoutMs = 10000): Promise<{ user: any; error: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return { user: session.user, error: null };

    // No local session – try network call with timeout
    return await Promise.race<{ user: any; error: any }>([
      supabase.auth.getUser().then(r => ({ user: r.data.user, error: r.error })),
      new Promise(resolve =>
        setTimeout(() => resolve({ user: null, error: new Error('Auth check timed out') }), timeoutMs),
      ),
    ]);
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Verify auth session is still valid before a critical operation (form submit).
 * If the token is close to expiry, attempts a refresh with a timeout.
 * Returns the current user or null + error.
 */
export async function refreshAuthBeforeSubmit(timeoutMs = 8000): Promise<{ user: any; error?: any }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      return { user: null, error: error || new Error('No active session') };
    }

    // If token expires within 5 minutes, proactively refresh
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);

    if (expiresAt && expiresAt - now < 300) {
      try {
        const result = await Promise.race<Awaited<ReturnType<typeof supabase.auth.refreshSession>>>([
          supabase.auth.refreshSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Session refresh timed out')), timeoutMs),
          ),
        ]);

        if (result.error || !result.data.session) {
          return { user: null, error: result.error || new Error('Session refresh failed') };
        }
        return { user: result.data.session.user, error: null };
      } catch (refreshErr) {
        return { user: null, error: refreshErr };
      }
    }

    return { user: session.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}
