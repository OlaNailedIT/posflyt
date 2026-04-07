import { useQuery } from "@tanstack/react-query";
import { getAdminBillingOverview } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useAdminBillingOverview() {
  const role = useAuthStore((s) => s.user?.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = isAuthenticated && role === "ADMIN";

  return useQuery({
    queryKey: ["admin-billing-overview"],
    queryFn: getAdminBillingOverview,
    enabled: on,
    staleTime: 1000 * 60,
  });
}
