/**
 * Placeholder “screenshot” frames — replace src in /public with real PNG/WebP exports when available.
 */
export default function ProductMockupsSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="text-center text-3xl font-bold text-stone-900 dark:text-stone-100">
        Built for the counter and the back office
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-stone-600 dark:text-stone-400">
        Dashboard metrics on desktop, fast checkout on mobile—same data, offline-friendly sync.
      </p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <figcaption className="border-b border-stone-200 bg-white/90 px-3 py-2 text-xs font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-950/90 dark:text-stone-400">
            Web dashboard (sample)
          </figcaption>
          <div className="aspect-[16/10] bg-gradient-to-br from-stone-200 to-stone-100 p-4 dark:from-stone-800 dark:to-stone-900">
            <div className="flex h-full flex-col rounded-lg border border-stone-300/80 bg-white p-3 shadow-inner dark:border-stone-600 dark:bg-stone-950">
              <div className="flex gap-2 border-b border-stone-200 pb-2 dark:border-stone-700">
                <span className="h-2 w-16 rounded bg-teal-600/80" />
                <span className="h-2 w-10 rounded bg-stone-300 dark:bg-stone-600" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="h-14 rounded bg-teal-50 dark:bg-teal-950/50" />
                <div className="h-14 rounded bg-stone-100 dark:bg-stone-800" />
                <div className="h-14 rounded bg-stone-100 dark:bg-stone-800" />
              </div>
              <div className="mt-3 flex-1 rounded border border-dashed border-stone-200 dark:border-stone-700" />
            </div>
          </div>
        </figure>
        <figure className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <figcaption className="border-b border-stone-200 bg-white/90 px-3 py-2 text-xs font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-950/90 dark:text-stone-400">
            Mobile POS (sample)
          </figcaption>
          <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-stone-200 to-amber-50/50 p-6 dark:from-stone-800 dark:to-stone-900">
            <div className="h-[22rem] w-[11rem] max-h-[85vh] rounded-[2rem] border-4 border-stone-800 bg-white p-3 shadow-2xl dark:border-stone-600 dark:bg-stone-950">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-600" />
              <div className="space-y-2">
                <div className="h-8 rounded bg-stone-100 dark:bg-stone-800" />
                <div className="h-8 rounded bg-stone-100 dark:bg-stone-800" />
                <div className="mt-4 h-12 rounded-lg bg-teal-600 dark:bg-teal-500" />
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
