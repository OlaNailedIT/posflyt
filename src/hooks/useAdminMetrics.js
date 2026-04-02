import { useQuery } from "@tanstack/react-query";
import { getAdminMetrics } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useAdminMetrics() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN";
  return useQuery({
    queryKey: ["admin-metrics"],
    queryFn: getAdminMetrics,
    enabled: isAdmin,
    refetchInterval: 15000,
  });
}
