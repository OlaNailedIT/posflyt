/** Lightweight social-proof metrics row (replace with real numbers when available). */
const METRICS = [
  { label: "Transactions processed", value: "10k+" },
  { label: "Cities & regions", value: "Multi-city" },
  { label: "Uptime focus", value: "Always-on POS" },
];

export default function TrustMetrics() {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
      {METRICS.map((m) => (
        <div
          key={m.label}
          className="rounded-xl border border-stone-200 bg-white/80 px-4 py-3 text-center dark:border-stone-700 dark:bg-stone-900/60"
        >
          <p className="text-2xl font-black text-teal-800 dark:text-teal-400">{m.value}</p>
          <p className="text-xs font-medium text-stone-600 dark:text-stone-400">{m.label}</p>
        </div>
      ))}
    </div>
  );
}
