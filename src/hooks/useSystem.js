import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminDailyCloseStatus,
  getAuditLogs,
  getBackups,
  getHelpContent,
  getRecoveryInfo,
  getReliabilitySummary,
  getSystemHealth,
  postAdminDailyClose,
  postIndexedDBBackup,
  reportIssue,
  triggerBackup,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useSystemHealth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["system-health"],
    queryFn: getSystemHealth,
    enabled: isAuthenticated,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useReliabilitySummary(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["reliability-summary"],
    queryFn: getReliabilitySummary,
    enabled: on,
    refetchInterval: on ? 10000 : false,
    staleTime: 5000,
  });
}

export function useAdminDailyClose(enabled = true) {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  const query = useQuery({
    queryKey: ["admin-daily-close"],
    queryFn: getAdminDailyCloseStatus,
    enabled: on,
    refetchInterval: on ? 20000 : false,
    staleTime: 10000,
  });
  const confirm = useMutation({
    mutationFn: postAdminDailyClose,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-daily-close"] });
      qc.invalidateQueries({ queryKey: ["reliability-summary"] });
      qc.invalidateQueries({ queryKey: ["reports", "owner-daily-summary"] });
    },
  });
  return { ...query, confirmDailyClose: confirm };
}

export function useAuditLogs(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: getAuditLogs,
    enabled: on,
    staleTime: 1000 * 30,
  });
}

export function useBackups(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["backups"],
    queryFn: getBackups,
    enabled: on,
    staleTime: 1000 * 30,
  });
}

export function useRecoveryInfo(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  return useQuery({
    queryKey: ["recovery-info"],
    queryFn: getRecoveryInfo,
    enabled: on,
    staleTime: 1000 * 60,
  });
}

export function useTriggerBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function usePostIndexedDBBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postIndexedDBBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useHelpContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["help-content"],
    queryFn: getHelpContent,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });
}

export function useReportIssue() {
  return useMutation({
    mutationFn: reportIssue,
  });
}
