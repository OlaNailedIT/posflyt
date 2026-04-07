import { useQuery } from "@tanstack/react-query";
import {
  getAdminEvents,
  getAdminMonitoringAlerts,
  getAdminOperationalErrors,
  getAdminPayments,
  getAdminSyncSummary,
  getAdminTransactions,
  getAdminWebhookEvents,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

const POLL_MS = 12_000;

export function useAdminSyncSummary(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-sync-summary"],
    queryFn: getAdminSyncSummary,
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 5000,
  });
}

export function useAdminTransactions(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-transactions", params],
    queryFn: () => getAdminTransactions(params),
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}

export function useAdminEvents(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-events", params],
    queryFn: () => getAdminEvents(params),
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}

export function useAdminPayments(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-payments", params],
    queryFn: () => getAdminPayments(params),
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}

export function useAdminWebhookEvents(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-webhook-events", params],
    queryFn: () => getAdminWebhookEvents(params),
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}

export function useAdminOperationalErrors(params, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-errors", params],
    queryFn: () => getAdminOperationalErrors(params),
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}

export function useAdminMonitoringAlertsQuery(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["admin-monitoring-alerts"],
    queryFn: getAdminMonitoringAlerts,
    enabled: on,
    refetchInterval: on ? POLL_MS : false,
    staleTime: 4000,
  });
}
