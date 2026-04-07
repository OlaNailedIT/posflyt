import { useQuery } from "@tanstack/react-query";
import { getAdminSalesFeed } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useAdminSalesFeed() {
  const role = useAuthStore((s) => s.user?.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = role === "ADMIN";
  const on = isAuthenticated && isAdmin;

  return useQuery({
    queryKey: ["admin-sales-feed"],
    queryFn: getAdminSalesFeed,
    enabled: on,
    refetchInterval: on ? 5000 : false,
    staleTime: 3000,
  });
}
