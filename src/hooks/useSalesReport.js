import { useQuery } from "@tanstack/react-query";
import { getSalesReport } from "../services/api";

export function useSalesReport(params, enabled = true) {
  return useQuery({
    queryKey: ["sales-report", params],
    queryFn: () => getSalesReport(params),
    enabled,
    staleTime: 1000 * 60 * 2,
  });
}
