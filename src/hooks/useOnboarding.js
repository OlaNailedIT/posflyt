import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus, markOnboardingActive } from "../services/api";
import { useAuthStore } from "../stores/authStore";

export function useOnboardingStatus() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const query = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    markOnboardingActive().catch(() => {});
    return undefined;
  }, [isAuthenticated]);

  return query;
}
