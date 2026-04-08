import { Link } from "react-router-dom";
import { useUsageSummary } from "../hooks/useUsageInsights";

/**
 * Soft warning when any quota crosses the configured soft threshold (Phase 7.5).
 */
export default function QuotaBanner() {
  const { data, isLoading, isError } = useUsageSummary();
  if (isLoading || isError || !data?.upsell?.showUpgrade) return null;

  const q = data.quotas || {};
  const parts = [];
  if (q.transactions?.nearLimit && !q.transactions?.atLimit) {
    parts.push(
      `Transactions: ${q.transactions.used} / ${q.transactions.limit} this month`
    );
  }
  if (q.customers?.nearLimit && !q.customers?.atLimit) {
    parts.push(`Customers: ${q.customers.used} / ${q.customers.limit}`);
  }
  if (q.products?.nearLimit && !q.products?.atLimit) {
    parts.push(`Products: ${q.products.used} / ${q.products.limit}`);
  }
  if (q.apiRequests?.nearLimit && !q.apiRequests?.atLimit) {
    parts.push(`API (metered routes): ${q.apiRequests.used} / ${q.apiRequests.limit}`);
  }

  if (parts.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">Approaching usage limits:</span> {parts.join(" · ")}
        </p>
        <Link
          to="/usage"
          className="shrink-0 font-medium text-teal-800 underline decoration-teal-600/40 hover:decoration-teal-700 dark:text-teal-300"
        >
          View usage & upgrade
        </Link>
      </div>
    </div>
  );
}
