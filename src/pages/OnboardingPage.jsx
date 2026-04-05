import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useOnboardingStatus } from "../hooks/useOnboarding";
import { useProducts } from "../hooks/useProducts";

const templates = {
  "Mini-mart": "Focus on fast-moving essentials and set low-stock thresholds for daily items.",
  Pharmacy: "Add medicine categories first, then verify quantities before your first sale.",
  Kiosk: "Start with your top 10 items and use quick POS checkout for speed.",
  Salon: "Add top services/products and complete one sale to verify your workflow.",
};

function safePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export default function OnboardingPage() {
  const {
    data,
    isLoading: onboardingLoading,
    isError: onboardingError,
    error: onboardingErr,
    refetch: refetchOnboarding,
  } = useOnboardingStatus();
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useProducts();
  const [template, setTemplate] = useState("Mini-mart");

  const firstSaleDone = Boolean(data?.firstSaleDone);
  const productsTargetDone = products.length >= 3;
  const rawProgress = (Number(productsTargetDone) + Number(firstSaleDone)) / 2 * 100;
  const onboardingProgress = safePercent(rawProgress);

  const loading = onboardingLoading || productsLoading;
  const fetchError = onboardingError || productsError;

  const errorMessage = useMemo(() => {
    const msg = onboardingErr?.message || "";
    if (productsError && onboardingError) return "We could not load onboarding or products. Check your connection and try again.";
    if (onboardingError) return msg || "Could not load onboarding status.";
    if (productsError) return "Could not load products. You can still use Inventory and POS.";
    return "";
  }, [onboardingErr, onboardingError, productsError]);

  if (loading) {
    return (
      <section className="min-h-[12rem] space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-32 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />
        <p className="text-sm text-stone-500">Loading onboarding…</p>
      </section>
    );
  }

  if (fetchError) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">Could not load everything</p>
        <p className="mt-1">{errorMessage}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => {
              refetchOnboarding();
              refetchProducts();
            }}
          >
            Retry
          </button>
          <Link to="/inventory" className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs dark:border-stone-600">
            Go to Inventory
          </Link>
          <Link to="/dashboard" className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs dark:border-stone-600">
            Dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Get started in 3 steps</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Follow this 15-minute setup: add 3 products, complete first sale, then review your first-day
        summary.
      </p>
      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <label className="text-sm font-medium">Quick-start template</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(templates).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTemplate(key)}
              className={`rounded px-2.5 py-1 text-xs ${template === key ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "border border-stone-300 dark:border-stone-600"}`}
            >
              {key}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{templates[template]}</p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <div className="mb-3">
          <p className="text-sm">Progress: {onboardingProgress}%</p>
          <div className="mt-1 h-2 w-full rounded bg-stone-200 dark:bg-stone-700">
            <div
              className="h-2 rounded bg-teal-600 dark:bg-teal-500"
              style={{ width: `${String(onboardingProgress)}%` }}
            />
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          <li className={productsTargetDone ? "text-emerald-700 dark:text-emerald-400" : ""}>
            {productsTargetDone ? "Done" : "Pending"} - Step 1: Add 3 products ({products.length}/3)
          </li>
          <li className={firstSaleDone ? "text-emerald-700 dark:text-emerald-400" : ""}>
            {firstSaleDone ? "Done" : "Pending"} - Step 2: Make your first sale
          </li>
          <li className={productsTargetDone && firstSaleDone ? "text-emerald-700 dark:text-emerald-400" : ""}>
            {productsTargetDone && firstSaleDone ? "Done" : "Pending"} - Step 3: Review first-day summary
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/inventory" className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white">
            Add Product
          </Link>
          <Link
            to="/pos"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Make Sale
          </Link>
          <Link
            to="/dashboard"
            className="ml-auto rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
      {!!data?.reminders?.length && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="font-semibold text-amber-900 dark:text-amber-300">Reminders</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
            {data.reminders.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
