import { create } from "zustand";

/**
 * Phase 7.13.2: smart alerts with action routes (low stock → inventory, sync failure → settings).
 * Notifications are merged from low-stock (dashboard) and sync (global offline store).
 */
export const useNotificationStore = create((set) => ({
  notifications: [],

  upsertLowStockNotifications: (products, enabled = true) =>
    set((s) => {
      const rest = s.notifications.filter((n) => n.source !== "low_stock");
      if (!enabled || !Array.isArray(products) || products.length === 0) {
        return { notifications: rest };
      }
      const low = products.map((p) => ({
        id: `low-stock-${p.id}`,
        source: "low_stock",
        type: p.isCritical ? "critical" : "warning",
        message: `${p.name} stock is low (${p.stock}/${p.lowStockThreshold ?? "—"})`,
        actionText: "View in inventory",
        actionRoute: `/inventory?filter=low_stock&focus=${encodeURIComponent(p.id)}`,
      }));
      return { notifications: [...rest, ...low] };
    }),

  updateSyncFailureAlert: (failedTransactions, lastSyncError) =>
    set((s) => {
      const rest = s.notifications.filter((n) => n.source !== "sync");
      const failed = Number(failedTransactions || 0);
      const rawErr = lastSyncError != null ? String(lastSyncError).trim() : "";
      const safeErr =
        rawErr &&
        !/\n|\r/.test(rawErr) &&
        !/prisma|postgresql|query engine/i.test(rawErr) &&
        rawErr.length <= 120
          ? rawErr.slice(0, 120)
          : "";
      const err = Boolean(safeErr);
      if (failed <= 0 && !err) {
        return { notifications: rest };
      }
      const parts = [];
      if (failed > 0) parts.push(`${failed} sale(s) failed to sync`);
      if (err) parts.push(safeErr);
      return {
        notifications: [
          ...rest,
          {
            id: "sync-queue",
            source: "sync",
            type: "error",
            message: parts.join(" · ") || "Synchronization needs attention.",
            actionText: "Open sync queue",
            actionRoute: "/dashboard#sync-trust",
          },
        ],
      };
    }),

}));
