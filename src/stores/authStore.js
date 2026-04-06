import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTH_TOKEN_KEY } from "../utils/authToken";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: ({ user, token }) => {
        if (typeof localStorage !== "undefined") {
          if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
          else localStorage.removeItem(AUTH_TOKEN_KEY);
        }
        return set({
          user,
          token,
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
        }
        return set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    { name: "posflyt-auth" }
  )
);
