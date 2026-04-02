import { create } from "zustand";

export const useNotificationStore = create((set) => ({
  notifications: [],
  upsertLowStockNotifications: (products) =>
    set({
      notifications: products.map((p) => ({
        id: `low-stock-${p.id}`,
        type: p.isCritical ? "critical" : "warning",
        message: `${p.name} stock is low (${p.stock}/${p.lowStockThreshold})`,
      })),
    }),
}));
