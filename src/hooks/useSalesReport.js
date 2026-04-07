import { useQuery } from "@tanstack/react-query";
import { getSalesReport } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { useOfflineStore } from "../stores/offlineStore";

export function useSalesReport(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isOnline = useOfflineStore((s) => s.isOnline);
  return useQuery({
    queryKey: ["sales-report", params],
    queryFn: () => getSalesReport(params),
    enabled: enabled && isAuthenticated && isOnline,
    staleTime: 1000 * 60 * 2,
  });
}
