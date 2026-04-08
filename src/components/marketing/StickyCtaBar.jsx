import TrackedLink from "../TrackedLink";

/** Sticky conversion bar on marketing pages (above-the-fold CTA companion). */
export default function StickyCtaBar() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-stone-100/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/95 md:py-3.5"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Quick sign up"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
          <span className="hidden sm:inline">Ready to run your store smarter? </span>
          Start free today.
        </p>
        <TrackedLink
          to="/register"
          eventName="sticky_cta_click"
          eventParams={{ placement: "sticky_bar" }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
        >
          Start free trial
          <span aria-hidden>→</span>
        </TrackedLink>
      </div>
    </div>
  );
}
