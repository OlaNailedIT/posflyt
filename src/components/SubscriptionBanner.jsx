import { Link } from "react-router-dom";

/**
 * Prominent subscription / trial messaging (Phase 7.4).
 */
export default function SubscriptionBanner({ subscription }) {
  if (!subscription) return null;

  const {
    subscriptionActive,
    accessReason,
    trialDaysRemaining,
    lifecycleWarnings = [],
    plan,
    inGracePeriod,
    graceEndsAt,
    cancelAtPeriodEnd,
  } = subscription;

  const trialSoon =
    plan === "FREE" &&
    trialDaysRemaining != null &&
    trialDaysRemaining > 0 &&
    trialDaysRemaining <= 7;

  if (
    subscriptionActive &&
    !lifecycleWarnings?.length &&
    !inGracePeriod &&
    !cancelAtPeriodEnd &&
    !trialSoon
  ) {
    return null;
  }

  const tone =
    !subscriptionActive || accessReason === "TRIAL_EXPIRED"
      ? "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
      : inGracePeriod
        ? "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`} role="status">
      {!subscriptionActive && (
        <p className="font-semibold">
          {accessReason === "TRIAL_EXPIRED"
            ? "Trial ended — choose a plan"
            : "Subscription inactive — renew to continue"}
        </p>
      )}
      {trialSoon && subscriptionActive && (
        <p className="font-semibold">Trial: {trialDaysRemaining} day(s) remaining on Free.</p>
      )}
      {inGracePeriod && graceEndsAt && (
        <p className="font-semibold">
          Grace period: renew by {new Date(graceEndsAt).toLocaleString()} to avoid interruption.
        </p>
      )}
      {cancelAtPeriodEnd && (
        <p className="text-xs opacity-90">Cancellation scheduled at end of billing period.</p>
      )}
      {(lifecycleWarnings || []).map((w) => (
        <p key={w.code} className="mt-1 text-xs">
          {w.message}
        </p>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          to="/billing"
          className="inline-flex rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
        >
          Billing & plans
        </Link>
      </div>
    </div>
  );
}
