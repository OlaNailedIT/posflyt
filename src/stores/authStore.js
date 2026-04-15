import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../utils/authToken";

/**
 * Auth is persisted via zustand persist (localStorage). Rehydration merges into state — it does not
 * clear the session on load. Logout is only triggered from explicit 401 handling (api interceptor,
 * refresh failure with 401) or bootstrap when the session is truly empty (no token, no refresh).
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      /** Legacy field; refresh session uses HttpOnly cookie set by the API. */
      refreshToken: null,
      isAuthenticated: false,
      /** True when signed in via local PIN only (no JWT); API calls may 401 until refresh/sync. */
      offlineSessionActive: false,
      login: ({ user, token, offlineSessionActive }) => {
        if (typeof localStorage !== "undefined") {
          if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
          else localStorage.removeItem(AUTH_TOKEN_KEY);
          try {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          } catch {
            // ignore
          }
        }
        const offline = Boolean(offlineSessionActive && !token);
        return set({
          user,
          token,
          refreshToken: null,
          offlineSessionActive: offline,
          isAuthenticated: true,
        });
      },
      setUser: (user) =>
        set((state) => ({
          ...state,
          user,
        })),
      logout: () => {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        void import("../offline/authOfflineStore.js").then((m) => m.clearOfflineSession().catch(() => {}));
        return set({
          user: null,
          token: null,
          refreshToken: null,
          offlineSessionActive: false,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "posflyt-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
