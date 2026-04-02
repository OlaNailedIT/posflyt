import { useState } from "react";
import { useCreateCheckoutSession, usePaymentHistory, useSubscription } from "../hooks/useBilling";
import { useToastStore } from "../stores/toastStore";

const plans = [
  { id: "FREE", title: "Free", amount: 0 },
  { id: "BASIC", title: "Basic", amount: 29 },
  { id: "PREMIUM", title: "Premium", amount: 99 },
];

export default function BillingPage() {
  const [provider, setProvider] = useState("STRIPE");
  const { data: subscription } = useSubscription();
  const { data: history = [] } = usePaymentHistory();
  const checkout = useCreateCheckoutSession();
  const showToast = useToastStore((s) => s.showToast);

  const onSelectPlan = async (plan) => {
    try {
      const data = await checkout.mutateAsync({ plan, provider });
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
      </p>
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
          {history.map((row) => (
            <div key={row.id} className="flex flex-wrap justify-between rounded border border-stone-200 px-3 py-2 dark:border-stone-700">
              <span>{row.provider}</span>
              <span>{row.plan}</span>
              <span>{row.status}</span>
              <span>{new Date(row.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {!history.length && <p className="text-stone-500">No payments yet.</p>}
        </div>
      </section>
    </section>
  );
}
