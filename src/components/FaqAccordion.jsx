/**
 * Accessible FAQ using native details/summary (keyboard + screen readers).
 * @param {{ items: Array<{ id?: string, q: string, a: string }> }} props
 */
export default function FaqAccordion({ items }) {
  return (
    <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white/90 dark:divide-stone-700 dark:border-stone-700 dark:bg-stone-900/90">
      {items.map((item) => (
        <details key={item.q} id={item.id} className="group p-0">
          <summary className="cursor-pointer list-none px-4 py-4 font-semibold text-stone-900 outline-none transition hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 dark:text-stone-100 dark:hover:bg-stone-800/80 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              {item.q}
              <span className="text-stone-400 transition group-open:rotate-180 dark:text-stone-500" aria-hidden>
                ▼
              </span>
            </span>
          </summary>
          <div className="border-t border-stone-100 px-4 pb-4 pt-0 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
