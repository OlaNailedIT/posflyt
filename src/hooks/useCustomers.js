import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomers, postCustomer, putCustomer } from "../services/api";

export function useCustomers() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
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
