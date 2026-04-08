/**
 * Primary access token key. After app bootstrap, the raw JWT is kept in memory (Zustand) and
 * removed from here to shorten XSS exposure. Refresh tokens remain here until httpOnly cookies exist server-side.
 * Strongest mitigation for tokens remains CSP + avoiding XSS; client-side "encryption" of localStorage is optional.
 */
export const AUTH_TOKEN_KEY = "auth_token";

/**
 * Refresh token persistence across browser restarts. Prefer httpOnly cookies when the backend supports them.
 * Same XSS class as localStorage access tokens — minimize script injection risk.
 */
export const REFRESH_TOKEN_KEY = "refresh_token";

/**
 * Read access token from legacy locations before bootstrap completes.
 * After `bootstrapAuthSession()`, prefer `useAuthStore.getState().token`.
 */
export function getStoredAuthTokenSync() {
  if (typeof localStorage === "undefined") return null;
  try {
    const direct = localStorage.getItem(AUTH_TOKEN_KEY);
    if (direct) return direct;
  } catch {
    // ignore
  }
  return null;
}

export function getRefreshTokenSync() {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}
