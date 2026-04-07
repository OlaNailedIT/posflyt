import { useState } from "react";

const SLIDES = [
  { id: "sales", label: "Sales overview", caption: "Live sales and trends" },
  { id: "inventory", label: "Inventory", caption: "Stock levels at a glance" },
  { id: "reports", label: "Reports", caption: "Export-ready summaries" },
];

/**
 * Placeholder slider for dashboard screenshots — swap panels for real images later.
 */
export default function DashboardPreviewSlider() {
  const [index, setIndex] = useState(0);
  const len = SLIDES.length;
  const prev = () => setIndex((i) => (i - 1 + len) % len);
  const next = () => setIndex((i) => (i + 1) % len);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-100 to-teal-50/50 shadow-inner dark:border-stone-700 dark:from-stone-800 dark:to-teal-950/30">
        <div
          className="aspect-video w-full transition-opacity duration-300"
          role="img"
          aria-roledescription="carousel"
          aria-label={`Dashboard preview: ${SLIDES[index].label}`}
        >
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <p className="text-lg font-semibold text-stone-800 dark:text-stone-100">{SLIDES[index].label}</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{SLIDES[index].caption}</p>
            <p className="mt-4 text-xs text-stone-500 dark:text-stone-500">Replace with product screenshot or embed</p>
          </div>
        </div>
        <button
          type="button"
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-stone-300 bg-white/90 px-3 py-2 text-sm shadow hover:bg-white dark:border-stone-600 dark:bg-stone-900/90 dark:hover:bg-stone-800"
          aria-label="Previous slide"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-stone-300 bg-white/90 px-3 py-2 text-sm shadow hover:bg-white dark:border-stone-600 dark:bg-stone-900/90 dark:hover:bg-stone-800"
          aria-label="Next slide"
        >
          ›
        </button>
      </div>
      <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Slide indicators">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-2 w-2 rounded-full transition ${i === index ? "bg-teal-600 dark:bg-teal-400" : "bg-stone-300 dark:bg-stone-600"}`}
            aria-label={`Show ${s.label}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </div>
  );
}
