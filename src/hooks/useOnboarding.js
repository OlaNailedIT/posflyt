import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus, markOnboardingActive } from "../services/api";

export function useOnboardingStatus() {
  const query = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  });

  useEffect(() => {
    markOnboardingActive().catch(() => {});
  }, []);

  return query;
}
