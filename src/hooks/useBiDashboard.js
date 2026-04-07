import { useQuery } from "@tanstack/react-query";
import { getBiSnapshot, getBiTransactions } from "../services/api";
import { useAuthStore } from "../stores/authStore";

const POLL_MS = 60_000;

function buildSnapshotParams({ from, to, granularity, productId, storeId }) {
  return {
    from,
    to,
    granularity: granularity || "day",
    ...(productId?.trim() ? { productId: productId.trim() } : {}),
    ...(storeId?.trim() ? { storeId: storeId.trim() } : {}),
  };
}

export function useBiSnapshot(filters, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  const params = buildSnapshotParams(filters);
  return useQuery({
    queryKey: ["bi-snapshot", params],
    queryFn: () => getBiSnapshot(params),
    enabled: on && Boolean(filters.from && filters.to),
    refetchInterval: on ? POLL_MS : false,
    staleTime: 30_000,
  });
}

export function useBiTransactionsDrilldown(filters, page, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const on = enabled && isAuthenticated;
  const params = {
    ...buildSnapshotParams(filters),
    page,
    pageSize: 25,
  };
  return useQuery({
    queryKey: ["bi-transactions", params],
    queryFn: () => getBiTransactions(params),
    enabled: on && Boolean(filters.from && filters.to),
    staleTime: 15_000,
  });
}
