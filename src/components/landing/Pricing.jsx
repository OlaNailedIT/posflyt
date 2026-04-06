import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CURRENCY, PRICING_TIERS } from "../../config/pricing";
import { useRegion } from "../../context/RegionContext";

export default function Pricing() {
  const { defaultCurrency } = useRegion();
  const [currency, setCurrency] = useState(() => defaultCurrency);

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100">Simple, localized pricing</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Nigeria (NGN) and South Africa (ZAR). Toggle to compare—billed in your market currency at launch.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-900">
          <span className="pl-2 text-xs text-stone-500 dark:text-stone-400">Currency</span>
          {(["NGN", "ZAR"]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setCurrency(code)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                currency === code
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              {CURRENCY[code].label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PRICING_TIERS.map((plan) => {
          const price = currency === "ZAR" ? plan.zar.display : plan.ngn.display;
          return (
            <article
              key={plan.id}
              className="rounded-2xl border border-stone-200 bg-white/90 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/90"
            >
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{plan.name}</h3>
              <p className="mt-2 text-3xl font-black text-teal-800 dark:text-teal-400">{price}</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{plan.details}</p>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">per month · indicative</p>
              <Link
                to="/register"
                className="mt-5 flex w-full items-center justify-center rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
              >
                Get started
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
