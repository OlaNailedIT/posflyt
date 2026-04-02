import { useQuery } from "@tanstack/react-query";
import { getAdminSalesFeed } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useAdminSalesFeed() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN";

  return useQuery({
    queryKey: ["admin-sales-feed"],
    queryFn: getAdminSalesFeed,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 5000 : false,
    staleTime: 3000,
  });
}
