import { useQuery } from "@tanstack/react-query";
import {
  getForecast,
  getForecastDataset,
  getInsights,
  getProfitAnalytics,
  getSalesOptimization,
  getSmartAlerts,
  getStaffPerformance,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useProfitAnalytics() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "profit"],
    queryFn: getProfitAnalytics,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}

export function useStaffPerformance() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "staff-performance"],
    queryFn: getStaffPerformance,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}

export function useSmartAlerts() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "smart-alerts"],
    queryFn: getSmartAlerts,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}

export function useInsights() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "insights"],
    queryFn: getInsights,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}

export function useForecast() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "forecast"],
    queryFn: getForecast,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}

export function useForecastDataset() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "forecast-dataset"],
    queryFn: getForecastDataset,
    enabled: role === "ADMIN" && plan !== "FREE",
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesOptimization() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  return useQuery({
    queryKey: ["analytics", "sales-optimization"],
    queryFn: getSalesOptimization,
    enabled: role === "ADMIN" && plan !== "FREE",
    refetchInterval: 15000,
  });
}
