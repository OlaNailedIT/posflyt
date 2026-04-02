import { create } from "zustand";

export const useToastStore = create((set) => ({
  message: null,
  variant: "info",
  showToast: (message, variant = "info") => set({ message, variant }),
  clearToast: () => set({ message: null }),
}));
