const plans = [
  { name: "Starter", price: "$79", details: "Up to 2 locations" },
  { name: "Growth", price: "$199", details: "Up to 10 locations" },
  { name: "Enterprise", price: "Custom", details: "Unlimited scale" },
];

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100">Plans based on business size</h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        Start free, then upgrade when you need advanced analytics and team visibility.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className="rounded-2xl border border-stone-200 bg-white/90 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/90"
          >
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{plan.name}</h3>
            <p className="mt-2 text-3xl font-black text-teal-800 dark:text-teal-400">{plan.price}</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{plan.details}</p>
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
            >
              Select this plan
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
