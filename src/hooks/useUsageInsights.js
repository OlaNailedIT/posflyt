import { useQuery } from "@tanstack/react-query";
import { getUsageFeatures, getUsageSummary } from "../services/api";

export function useUsageSummary() {
  return useQuery({
    queryKey: ["usage", "summary"],
    queryFn: getUsageSummary,
    staleTime: 60_000,
  });
}

export function useUsageFeatures() {
  return useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
}
