import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../services/api";
import { getProductsCache, saveProducts } from "../services/db";
import { useOfflineStore } from "../stores/offlineStore";

export function useProducts() {
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useQuery({
    queryKey: ["products"],
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
