import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../services/api";
import { getProductsCache, saveProducts } from "../services/db";
import { useAuthStore } from "../stores/authStore";
import { useOfflineStore } from "../stores/offlineStore";

export function useProducts() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ["products"],
    enabled: isAuthenticated,
    queryFn: async () => {
      if (isOnline) {
        try {
          const data = await getProducts();
          await saveProducts(data);
          return data;
        } catch {
          return getProductsCache();
        }
      }
      return getProductsCache();
    },
    staleTime: 1000 * 60 * 2,
  });
}
