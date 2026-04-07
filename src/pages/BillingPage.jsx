import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateCheckoutSession, usePaymentHistory, useSubscription } from "../hooks/useBilling";
import {
  downloadBillingPaymentsCsv,
  getBillingLifecycleMetrics,
  getAdminPaymentsReconcile,
  postAdminPaymentsReconcileApply,
  postCancelSubscription,
} from "../services/api";
import SubscriptionBanner from "../components/SubscriptionBanner";
import { useAdminBillingOverview } from "../hooks/useAdminBillingOverview";
import {
  useAdminWebhookEvents,
  useAdminPaymentsSearch,
  useAdminPaymentRetriesRun,
} from "../hooks/useAdminBillingExtras";
import { useAuthStore } from "../stores/authStore";
import { useToastStore } from "../stores/toastStore";

const LAST_CHECKOUT_RID_KEY = "posflyt_last_checkout_request_id";

const plans = [
  { id: "FREE", title: "Free", amount: 0 },
  { id: "BASIC", title: "Basic", amount: 29 },
  { id: "PREMIUM", title: "Premium", amount: 99 },
];

export default function BillingPage() {
  const [provider, setProvider] = useState("STRIPE");
  const [paySearch, setPaySearch] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [lastCheckoutRid, setLastCheckoutRid] = useState(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LAST_CHECKOUT_RID_KEY) : null
  );
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const { data: subscription } = useSubscription();
  const { data: history = [] } = usePaymentHistory();
  const { data: adminOverview } = useAdminBillingOverview();
  const { data: webhookEvents = [] } = useAdminWebhookEvents();
  const { data: filteredPayments = [] } = useAdminPaymentsSearch(paySearch, payStatus);
  const retriesRun = useAdminPaymentRetriesRun();
  const checkout = useCreateCheckoutSession();
  const showToast = useToastStore((s) => s.showToast);
  const qc = useQueryClient();
  const { data: lifecycleMetrics } = useQuery({
    queryKey: ["billing-lifecycle-metrics"],
    queryFn: getBillingLifecycleMetrics,
    enabled: isAdmin,
    staleTime: 60_000,
  });
  const { data: reconcile, refetch: refetchReconcile } = useQuery({
    queryKey: ["billing-payments-reconcile"],
    queryFn: getAdminPaymentsReconcile,
    enabled: false,
  });
  const applyReconcile = useMutation({
    mutationFn: postAdminPaymentsReconcileApply,
  });
  const cancelSub = useMutation({
    mutationFn: postCancelSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      showToast("Cancellation scheduled for end of period.", "success");
    },
    onError: (e) => showToast(e?.response?.data?.message || "Could not update subscription.", "error"),
  });

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    const v = sessionStorage.getItem(LAST_CHECKOUT_RID_KEY);
    if (v) setLastCheckoutRid(v);
  }, []);

  const onSelectPlan = async (plan) => {
    try {
      const data = await checkout.mutateAsync({ plan, provider });
      if (data?.requestId) {
        sessionStorage.setItem(LAST_CHECKOUT_RID_KEY, data.requestId);
        setLastCheckoutRid(data.requestId);
      }
      window.location.assign(data.redirectUrl);
    } catch (error) {
      showToast(error.response?.data?.message || "Could not start checkout.", "error");
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-bold">Billing</h1>
      <p className="mt-1 text-sm text-stone-500">
        Current plan: <span className="font-semibold">{subscription?.plan || "FREE"}</span>
        {subscription?.trialEndsAt && (
          <span className="ml-2 text-xs">
            · Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}
          </span>
        )}
        {subscription?.subscriptionActive === false && (
          <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            · Trial or subscription inactive — choose a plan to continue.
          </span>
        )}
      </p>

      {subscription && <SubscriptionBanner subscription={subscription} />}

      {isAdmin && subscription?.plan !== "FREE" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs dark:border-stone-600"
            onClick={() => downloadBillingPaymentsCsv().catch(() => showToast("Export failed.", "error"))}
          >
            Download payments CSV
          </button>
          <button
            type="button"
            disabled={cancelSub.isPending || subscription?.cancelAtPeriodEnd}
            className="rounded-lg border border-amber-600 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-500 dark:text-amber-200"
            onClick={() => {
              if (window.confirm("Schedule cancellation at end of the current billing period?")) {
                cancelSub.mutate();
              }
            }}
          >
            {subscription?.cancelAtPeriodEnd ? "Cancellation scheduled" : "Cancel at period end"}
          </button>
        </div>
      )}

      {isAdmin && lifecycleMetrics && (
        <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4 text-xs dark:border-stone-700 dark:bg-stone-900">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Lifecycle metrics (30d)</h2>
          <p className="mt-1 text-stone-500">
            Trial→paid (approx):{" "}
            {lifecycleMetrics.trialToPaidConversionApprox != null
              ? `${(lifecycleMetrics.trialToPaidConversionApprox * 100).toFixed(1)}%`
              : "—"}
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-stone-600 dark:text-stone-400">
            {(lifecycleMetrics.byEventType || []).map((row) => (
              <li key={row.eventType}>
                {row.eventType}: {row._count._all}
              </li>
            ))}
          </ul>
        </section>
      )}

      {adminOverview && (
        <section
          className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
          aria-label="Revenue and sync overview"
        >
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Admin overview</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            SaaS payments (this workspace) and recent sync signals. POS register revenue is separate.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">Today</dt>
              <dd className="font-medium">${adminOverview.revenue?.day?.toFixed(2) ?? "0.00"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">7 days</dt>
              <dd className="font-medium">${adminOverview.revenue?.week?.toFixed(2) ?? "0.00"}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Month</dt>
              <dd className="font-medium">${adminOverview.revenue?.month?.toFixed(2) ?? "0.00"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
            Sync (7d): inventory conflicts {adminOverview.sync?.inventoryConflicts7d ?? 0}, retry failures{" "}
            {adminOverview.sync?.retryFailed7d ?? 0}
          </p>
          {adminOverview.recentPayments?.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
              {adminOverview.recentPayments.map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-1 border-t border-stone-100 pt-1 dark:border-stone-800">
                  <span className="font-mono text-[10px] text-stone-500">{row.providerRef}</span>
                  <span>
                    {row.plan} · {row.status}
                  </span>
                  <span>{row.amount != null ? `$${Number(row.amount).toFixed(2)}` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className="mt-3 max-w-2xl text-xs text-stone-600 dark:text-stone-400">
        Card data is never stored on POSflyt servers. With live keys, checkout uses Stripe Checkout or Paystack
        Initialize and returns a hosted payment URL; otherwise a return URL is used for development.
      </p>

      {lastCheckoutRid && (
        <p className="mt-2 text-xs text-stone-500">
          Last checkout correlation <span className="font-mono text-stone-700 dark:text-stone-300">{lastCheckoutRid}</span>{" "}
          (matches <code className="rounded bg-stone-200 px-1 dark:bg-stone-800">x-request-id</code> on the API response)
        </p>
      )}

      {isAdmin && (
        <section
          className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
          aria-label="Payment search and webhook log"
        >
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Transactions &amp; webhooks</h2>
          <p className="mt-1 text-xs text-stone-500">
            Search by provider reference, gateway event id, or API <code className="text-[10px]">clientRequestId</code>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search…"
              value={paySearch}
              onChange={(e) => setPaySearch(e.target.value)}
              className="min-w-[180px] flex-1 rounded border border-stone-300 bg-stone-50 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            />
            <select
              value={payStatus}
              onChange={(e) => setPayStatus(e.target.value)}
              className="rounded border border-stone-300 bg-stone-50 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-950"
            >
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
              <option value="retrying">retrying</option>
              <option value="canceled">canceled</option>
            </select>
            <button
              type="button"
              disabled={retriesRun.isPending}
              onClick={() =>
                retriesRun.mutate(undefined, {
                  onSuccess: (r) =>
                    showToast(
                      `Retry run: ${r?.processed ?? 0} payment(s) processed${r?.skipped ? ` (${r.skipped})` : ""}.`,
                      "success"
                    ),
                  onError: () => showToast("Could not run retry scan.", "error"),
                })
              }
              className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium dark:border-stone-600"
            >
              Run retry scan
            </button>
            <button
              type="button"
              className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium dark:border-stone-600"
              onClick={() =>
                refetchReconcile().then(({ data: payload }) =>
                  showToast(`Reconcile: ${payload?.discrepancies?.length ?? 0} issue(s).`, "success")
                )
              }
            >
              Reconcile
            </button>
            <button
              type="button"
              disabled={applyReconcile.isPending}
              className="rounded-lg border border-teal-600 px-3 py-1 text-xs font-medium text-teal-900 dark:border-teal-500 dark:text-teal-100"
              title="Re-query Stripe/Paystack and finalize pending rows the provider marks as paid (missed webhooks)"
              onClick={() =>
                applyReconcile.mutate(undefined, {
                  onSuccess: (r) =>
                    showToast(
                      `Apply: ${r?.applied?.length ?? 0} finalized, ${r?.errors?.length ?? 0} error(s).`,
                      r?.errors?.length ? "error" : "success"
                    ),
                  onError: () => showToast("Could not apply reconciliation.", "error"),
                })
              }
            >
              Apply provider fixes
            </button>
          </div>
          {reconcile?.discrepancies?.length > 0 && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              {reconcile.discrepancies.length} discrepancy(ies) vs provider — review payment IDs in support tools.
            </p>
          )}
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto text-xs">
            {filteredPayments.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2 border-t border-stone-100 pt-1 dark:border-stone-800">
                <span className="font-mono">{row.providerRef}</span>
                <span>{row.status}</span>
                {row.clientRequestId ? <span className="text-stone-500">req:{row.clientRequestId}</span> : null}
              </li>
            ))}
            {!filteredPayments.length && <li className="text-stone-500">No rows match.</li>}
          </ul>
          <h3 className="mt-4 text-sm font-medium text-stone-800 dark:text-stone-200">Recent gateway events</h3>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto font-mono text-[10px] text-stone-600 dark:text-stone-400">
            {webhookEvents.map((ev) => (
              <li key={ev.id}>
                {ev.provider} · {ev.dedupeKey} · {ev.outcome || "—"}
              </li>
            ))}
            {!webhookEvents.length && <li>None yet.</li>}
          </ul>
        </section>
      )}

      <div className="mt-4 flex items-center gap-3 text-sm">
        <span>Provider</span>
        <select
          className="rounded border border-stone-300 bg-stone-50 p-2 dark:border-stone-600 dark:bg-stone-900"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="STRIPE">Stripe</option>
          <option value="PAYSTACK">Paystack</option>
        </select>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <h2 className="font-semibold">{plan.title}</h2>
            <p className="text-sm text-stone-500">${plan.amount}/month</p>
            <button
              type="button"
              onClick={() => onSelectPlan(plan.id)}
              className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
            >
              Select plan
            </button>
          </article>
        ))}
      </div>
      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Payment history</h2>
        <div className="mt-2 space-y-2 text-sm">
          {history.map((row) => {
            const st = String(row.status || "").toLowerCase();
            const statusLabel =
              st === "paid"
                ? "success"
                : st === "failed"
                  ? "failed — you can retry from billing or wait for automatic retry"
                  : st === "pending"
                    ? "pending"
                    : st;
            return (
              <div key={row.id} className="flex flex-wrap justify-between rounded border border-stone-200 px-3 py-2 dark:border-stone-700">
                <span>{row.provider}</span>
                <span>{row.plan}</span>
                <span className={st === "failed" ? "text-amber-800 dark:text-amber-200" : st === "paid" ? "text-teal-700 dark:text-teal-300" : ""}>
                  {statusLabel}
                </span>
                <span>{new Date(row.createdAt).toLocaleString()}</span>
              </div>
            );
          })}
          {!history.length && <p className="text-stone-500">No payments yet.</p>}
        </div>
      </section>
    </section>
  );
}
