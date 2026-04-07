import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "../services/api";
import { getDashboardCache, saveDashboardCache } from "../services/db";
import { useAuthStore } from "../stores/authStore";
import { useOfflineStore } from "../stores/offlineStore";

export function useDashboardStats() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fallback = {
    revenue: 0,
    transactions: 0,
    lowStock: 0,
    customers: 0,
    returningCustomers: 0,
    lowStockProducts: [],
  };

  return useQuery({
    queryKey: ["dashboard-stats"],
    enabled: isAuthenticated,
    queryFn: async () => {
      if (isOnline) {
        try {
          const data = await getDashboardStats();
          await saveDashboardCache(data);
          return data;
        } catch {
          const cached = await getDashboardCache();
          return cached || fallback;
        }
      }
      const cached = await getDashboardCache();
      return cached || fallback;
    },
    staleTime: 1000 * 60 * 2,
  });
}
