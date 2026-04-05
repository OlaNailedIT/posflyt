export default function TrustSignalsSection() {
  const placeholders = [
    {
      quote: "“Finally a POS that doesn’t freeze when the network drops.”",
      name: "Early adopter · retail",
      region: "Nigeria",
    },
    {
      quote: "“Stock and sales stay aligned—we stopped guessing at close.”",
      name: "Pilot merchant · pharmacy",
      region: "South Africa",
    },
    {
      quote: "“Setup in one afternoon. Team picked it up fast.”",
      name: "Beta user · mini-mart",
      region: "Nigeria",
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-center text-sm font-semibold text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
        Coming soon: deeper rollout in{" "}
        <span className="whitespace-nowrap">Lagos</span> &amp;{" "}
        <span className="whitespace-nowrap">Cape Town</span> — join the early list.
      </div>

      <h2 className="mt-12 text-center text-3xl font-bold text-stone-900 dark:text-stone-100">
        Trusted by operators in the field
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-stone-600 dark:text-stone-400">
        Placeholder quotes from pilot users—real names and logos ship with your first case studies.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {placeholders.map((t) => (
          <blockquote
            key={t.quote}
            className="rounded-2xl border border-stone-200 bg-white/90 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/90"
          >
            <p className="text-sm italic text-stone-800 dark:text-stone-200">{t.quote}</p>
            <footer className="mt-3 text-xs text-stone-500 dark:text-stone-400">
              {t.name} · {t.region}
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
