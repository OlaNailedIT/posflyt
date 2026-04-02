export default function DashboardPreview() {
  return (
    <section id="dashboard" className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100">What you can monitor daily</h2>
      <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">
        Your dashboard shows sales, transactions, stock risk, and customer growth so you know what to
        do next.
      </p>
      <div className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/80 md:grid-cols-4">
        {[
          ["Revenue", "$18,420"],
          ["Transactions", "342"],
          ["Low Stock", "7"],
          ["Customers", "1,204"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-600 dark:bg-stone-950"
          >
            <p className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
