import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomers, postCustomer, putCustomer } from "../services/api";
import { getCustomersCache, saveCustomersCache } from "../services/db";
import { useAuthStore } from "../stores/authStore";
import { useOfflineStore } from "../stores/offlineStore";

export function useCustomers() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isOnline = useOfflineStore((s) => s.isOnline);

  const query = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      if (isOnline) {
        try {
          const data = await getCustomers();
          await saveCustomersCache(data);
          return data;
        } catch {
          return getCustomersCache();
        }
      }
      return getCustomersCache();
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });

  const addCustomer = useMutation({
    mutationFn: postCustomer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const editCustomer = useMutation({
    mutationFn: ({ id, payload }) => putCustomer(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  return { ...query, addCustomer, editCustomer };
}
