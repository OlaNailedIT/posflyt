import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminBillingWebhookEvents,
  getAdminPaymentsQuery,
  postAdminPaymentRetriesRun,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useAdminWebhookEvents() {
  const role = useAuthStore((s) => s.user?.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = isAuthenticated && role === "ADMIN";
  return useQuery({
    queryKey: ["admin-webhook-events"],
    queryFn: () => getAdminBillingWebhookEvents({ limit: 50 }),
    enabled: on,
    staleTime: 1000 * 30,
  });
}

export function useAdminPaymentsSearch(q, status) {
  const role = useAuthStore((s) => s.user?.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = isAuthenticated && role === "ADMIN";
  return useQuery({
    queryKey: ["admin-payments-query", q, status],
    queryFn: () =>
      getAdminPaymentsQuery({
        q: q?.trim() || undefined,
        status: status?.trim() || undefined,
      }),
    enabled: on,
    staleTime: 1000 * 15,
  });
}

export function useAdminPaymentRetriesRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postAdminPaymentRetriesRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments-query"] });
      qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
    },
  });
}
