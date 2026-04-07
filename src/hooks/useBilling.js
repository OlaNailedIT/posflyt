import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmBillingPayment,
  createCheckoutSession,
  getPaymentHistory,
  getSubscription,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useSubscription() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });
}

export function usePaymentHistory() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["payment-history"],
    queryFn: getPaymentHistory,
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });
}

export function useCreateCheckoutSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["payment-history"] });
    },
  });
}

export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmBillingPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["payment-history"] });
    },
  });
}
