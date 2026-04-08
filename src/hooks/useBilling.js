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
    refetchInterval: (query) => {
      const d = query.state.data;
      const days = d?.trialDaysRemaining;
      if (days != null && days > 0 && days <= 7) return 60_000;
      if (d?.inGracePeriod) return 120_000;
      return 300_000;
    },
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
      qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-webhook-events"] });
      qc.invalidateQueries({ queryKey: ["admin-payments-query"] });
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
      qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-webhook-events"] });
      qc.invalidateQueries({ queryKey: ["admin-payments-query"] });
    },
  });
}
