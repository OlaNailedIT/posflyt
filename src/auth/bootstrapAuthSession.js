import { refreshAccessTokenSilently } from "../services/authRefresh";
import { recoverStuckSyncingOutbox, recoverStuckSyncingTransactions } from "../services/db";
import { useAuthStore } from "../stores/authStore";
import { AUTH_TOKEN_KEY, getRefreshTokenSync } from "../utils/authToken";
import { bootstrapOfflineSession } from "./offlineAuthBootstrap";

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
  }

  let { token } = useAuthStore.getState();

  if (!token && getRefreshTokenSync()) {
    await refreshAccessTokenSilently();
    token = useAuthStore.getState().token;
  }

  if (!token && !getRefreshTokenSync()) {
    const restored = await bootstrapOfflineSession();
    if (restored) {
      token = useAuthStore.getState().token;
    }
  }

  // Only clear session when there is no access token and no refresh path left.
  // Do not logout on transient network errors during refresh (handled in refreshAccessTokenSilently).
  const st = useAuthStore.getState();
  if (!st.token && !getRefreshTokenSync() && !st.offlineSessionActive && st.isAuthenticated) {
    useAuthStore.getState().logout();
  }
}
