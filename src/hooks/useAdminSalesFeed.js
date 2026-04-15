import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import { useAuthStore } from "../stores/authStore";

function unwrapEnvelope(data) {
  return data && data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "data")
    ? data.data
    : data;
}

export function useAdminSalesFeed() {
  const role = useAuthStore((s) => s.user?.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = role === "ADMIN";
  const on = isAuthenticated && isAdmin;

  return useQuery({
    queryKey: ["admin-sales-feed"],
    enabled: on,
    queryFn: async () => {
      const res = await api.get("/admin/sales-feed");
      const body = res.data;
      const list = unwrapEnvelope(body);
      const rows = Array.isArray(list) ? list : [];
      return {
        list: rows,
        unavailable: Boolean(body?.salesFeedUnavailable),
      };
    },
    staleTime: 3000,
    retry: (failureCount, error) => {
      const status = error?.response?.status;
      if (status === 500 && failureCount >= 3) return false;
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10_000),
    refetchInterval: (query) => {
      if (!on) return false;
      const failures = query.state.fetchFailureCount;
      const lastStatus = query.state.error?.response?.status;
      if (failures >= 3 && lastStatus === 500) return false;
      return 5000;
    },
  });
}
