import { create } from "zustand";

const defaultSettings = {
  countryCode: "US",
  currencyCode: "USD",
  currencySymbol: "$",
  taxEnabled: false,
  taxRate: 0,
  taxRules: [{ countryCode: "US", enabled: false, rate: 0 }],
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessTimeZone: "UTC",
  logoUrl: "",
  receiptLayout: "STANDARD",
  quickSalesProductIds: null,
};

export const useSettingsStore = create((set) => ({
  settings: defaultSettings,
  setSettings: (settings) => set({ settings }),
}));
