/**
 * Marketing dashboard capability cards.
 * @param {{ blocks: Array<{ title: string, body: string }>, heading?: string }} props
 */
export default function DashboardWidgets({ blocks, heading = "Dashboard capabilities" }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20" aria-labelledby="dashboard-widgets-heading">
      <h2 id="dashboard-widgets-heading" className="text-center text-2xl font-bold text-stone-900 dark:text-stone-100">
        {heading}
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {blocks.map((b) => (
          <article
            key={b.title}
            className="rounded-2xl border border-stone-200 bg-white/90 p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-700 dark:bg-stone-900/90"
          >
            <h3 className="text-lg font-semibold text-teal-800 dark:text-teal-400">{b.title}</h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{b.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
