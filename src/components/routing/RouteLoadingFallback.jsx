/** Shown only inside layout Suspense while a lazy route chunk loads — shell stays visible. */
export default function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-stone-500 dark:text-stone-400">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
        aria-hidden
      />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
