import AppRouter from "./routes/AppRouter";
import MarketingPixels from "./components/marketing/MarketingPixels";

/**
 * Route-level lazy chunks suspend inside layout Suspense (AppShell / MarketingLayout),
 * not here — otherwise the whole tree (nav, shell) vanished while POS/Dashboard chunks load.
 */
export default function App() {
  return (
    <>
      <MarketingPixels />
      <AppRouter />
    </>
  );
}
