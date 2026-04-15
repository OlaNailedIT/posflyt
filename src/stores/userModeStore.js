import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { USER_MODE } from "../config/userMode";

/**
 * Persisted dashboard presentation preference for users who can switch (e.g. Manager/Admin).
 * Default CASHIER: safer default so financial intelligence is opt-in on shared devices.
 */
export const useUserModeStore = create(
  persist(
    (set) => ({
      dashboardMode: USER_MODE.CASHIER,
      setDashboardMode: (mode) => set({ dashboardMode: mode }),
    }),
    {
      name: "posflyt-dashboard-mode",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ dashboardMode: state.dashboardMode }),
    }
  )
);
