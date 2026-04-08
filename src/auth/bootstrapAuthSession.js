import { refreshAccessTokenSilently } from "../services/authRefresh";
import { recoverStuckSyncingOutbox, recoverStuckSyncingTransactions } from "../services/db";
import { useAuthStore } from "../stores/authStore";
import { AUTH_TOKEN_KEY, getRefreshTokenSync } from "../utils/authToken";

/**
 * After Zustand persist rehydrates: lift access token into memory and clear `auth_token` from localStorage
 * (reduces static token lifetime in storage). If no access token but a refresh token exists, run silent refresh.
 */
export async function bootstrapAuthSession() {
  try {
    await recoverStuckSyncingTransactions();
    await recoverStuckSyncingOutbox();
  } catch {
    // IndexedDB may be unavailable in private mode / quota; auth can still proceed.
  }

  if (typeof localStorage === "undefined") return;

  let access = null;
  try {
    access = localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }

  const state = useAuthStore.getState();
  if (!access && state.token) {
    access = state.token;
  }

  if (access) {
    useAuthStore.setState({ token: access, isAuthenticated: true });
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  let { token, isAuthenticated } = useAuthStore.getState();

  if (!token && getRefreshTokenSync()) {
    await refreshAccessTokenSilently();
    token = useAuthStore.getState().token;
  }

  if (!token && isAuthenticated) {
    useAuthStore.getState().logout();
  }
}
