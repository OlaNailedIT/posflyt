import { Suspense } from "react";
import AppRouter from "./routes/AppRouter";
import MarketingPixels from "./components/marketing/MarketingPixels";

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-stone-500 dark:text-stone-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" aria-hidden />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <MarketingPixels />
      <AppRouter />
    </Suspense>
  );
}
