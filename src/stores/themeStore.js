import { create } from "zustand";
import { persist } from "zustand/middleware";

function applyThemeClass(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => {
        if (theme !== "light" && theme !== "dark") return;
        set({ theme });
        applyThemeClass(theme);
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        applyThemeClass(next);
      },
    }),
    { name: "posflyt-theme" }
  )
);
