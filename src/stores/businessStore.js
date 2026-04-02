import { create } from "zustand";

export const useBusinessStore = create((set) => ({
  currency: "USD",
  timezone: "UTC",
  setBusinessContext: (payload) => set((state) => ({ ...state, ...payload })),
}));
