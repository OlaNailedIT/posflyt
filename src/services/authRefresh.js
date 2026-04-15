import axios from "axios";
import { API_BASE_URL } from "../config/apiBaseUrl";
import { useAuthStore } from "../stores/authStore";
import { getRefreshTokenSync } from "../utils/authToken";

/** No auth interceptors — avoids refresh → 401 → refresh loops. */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
  withCredentials: true,
});

function unwrapEnvelope(data) {
  return data && data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "data")
    ? data.data
    : data;
}

/**
 * Calls POST /auth/refresh when the backend exposes it (Phase 2.2+).
 * Expected envelope: { token, refreshToken? } after unwrap.
 */
async function postAuthRefresh(refreshTokenFromStorage) {
  const body = refreshTokenFromStorage ? { refreshToken: refreshTokenFromStorage } : {};
  const { data } = await refreshClient.post("/auth/refresh", body);
  return unwrapEnvelope(data);
}

/** Clears HttpOnly refresh cookie on the server (best-effort). */
export async function clearSessionCookie() {
  try {
    await refreshClient.post("/auth/logout");
  } catch {
    // ignore — client state will still be cleared
  }
}

let refreshInFlight = null;

/**
 * Single-flight silent refresh. Returns new access token string, or null if impossible/failed.
 * When no refresh token is stored (current API: access JWT only), returns null immediately.
 */
export async function refreshAccessTokenSilently() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const rt = getRefreshTokenSync();
      const data = await postAuthRefresh(rt);
      if (!data?.token) return null;
      const token = data.token;

      const state = useAuthStore.getState();
      state.login({
        user: data.user ?? state.user,
        token,
        refreshToken: null,
      });
      return token;
    } catch {
      // 401 and other failures: return null; api interceptor decides logout after retry rules.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
