import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../utils/authToken";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      /** Legacy field; refresh session uses HttpOnly cookie set by the API. */
      refreshToken: null,
      isAuthenticated: false,
      login: ({ user, token }) => {
        if (typeof localStorage !== "undefined") {
          if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
          else localStorage.removeItem(AUTH_TOKEN_KEY);
          try {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          } catch {
            // ignore
          }
        }
        return set({
          user,
          token,
          refreshToken: null,
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
        return set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "posflyt-auth",
      storage: createJSONStorage(() => localStorage),
      /** Never persist access/refresh tokens — only user + flag (tokens: localStorage keys + memory). */
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
