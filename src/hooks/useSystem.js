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
  reportIssue,
  triggerBackup,
} from "../services/api";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useReliabilitySummary(enabled = true) {
  return useQuery({
    queryKey: ["reliability-summary"],
    queryFn: getReliabilitySummary,
    enabled,
    refetchInterval: enabled ? 10000 : false,
    staleTime: 5000,
  });
}

export function useAdminDailyClose(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-daily-close"],
    queryFn: getAdminDailyCloseStatus,
    enabled,
    refetchInterval: enabled ? 20000 : false,
    staleTime: 10000,
  });
  const confirm = useMutation({
    mutationFn: postAdminDailyClose,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-daily-close"] });
      qc.invalidateQueries({ queryKey: ["reliability-summary"] });
    },
  });
  return { ...query, confirmDailyClose: confirm };
}

export function useAuditLogs(enabled = true) {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: getAuditLogs,
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useBackups(enabled = true) {
  return useQuery({
    queryKey: ["backups"],
    queryFn: getBackups,
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useRecoveryInfo(enabled = true) {
  return useQuery({
    queryKey: ["recovery-info"],
    queryFn: getRecoveryInfo,
    enabled,
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

export function useHelpContent() {
  return useQuery({
    queryKey: ["help-content"],
    queryFn: getHelpContent,
    staleTime: 1000 * 60 * 5,
  });
}

export function useReportIssue() {
  return useMutation({
    mutationFn: reportIssue,
  });
}
