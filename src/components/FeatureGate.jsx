import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSubscription } from "../hooks/useBilling";
import { getUsageFeatures } from "../services/api";

const PLAN_ORDER = { FREE: 0, BASIC: 1, PREMIUM: 2 };

/**
 * Soft UI gate for features that require a higher plan (API still enforces).
 * When `featureKey` is set, resolution matches the server (tier + optional A/B).
 */
export default function FeatureGate({ minPlan = "BASIC", featureKey, label, children }) {
  const { data: sub, isLoading } = useSubscription();
  const { data: features, isLoading: flagsLoading } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    enabled: Boolean(featureKey),
    staleTime: 60_000,
  });
  if (isLoading || (featureKey && flagsLoading)) return null;

  if (featureKey) {
    const ok = Boolean(features?.flags?.[featureKey]);
    if (ok) return children;
    return (
      <div
        className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600 dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-400"
        title={`Feature ${featureKey}`}
      >
        <p className="font-medium text-stone-800 dark:text-stone-200">
          {label || "This feature is not available for your workspace (plan or rollout)."}
        </p>
        <p className="mt-1 text-xs">Upgrade or check back if we are rolling this out gradually.</p>
        <Link
          to="/billing"
          className="mt-2 inline-flex rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          View plans
        </Link>
      </div>
    );
  }

  const current = sub?.plan || "FREE";
  const ok = (PLAN_ORDER[current] ?? 0) >= (PLAN_ORDER[minPlan] ?? 1);
  if (ok) return children;

  return (
    <div
      className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600 dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-400"
      title={`Requires ${minPlan} or higher`}
    >
      <p className="font-medium text-stone-800 dark:text-stone-200">
        {label || "This feature is not available on your current plan."}
      </p>
      <p className="mt-1 text-xs">Upgrade to {minPlan} (or higher) to unlock.</p>
      <Link
        to="/billing"
        className="mt-2 inline-flex rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
      >
        View plans
      </Link>
    </div>
  );
}
