import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { startOfflineSyncBootstrap } from "./offline/syncBootstrap";
import { useUfecOperationalResilience } from "./hooks/useUfecOperationalResilience";
import { useSettings } from "./hooks/useSettings";
import ToastHost from "./components/ToastHost";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import ThemeSync from "./components/ThemeSync";
import { RegionProvider } from "./context/RegionContext";
import { AnalyticsProvider } from "./context/AnalyticsContext";
import { bootstrapAuthSession } from "./auth/bootstrapAuthSession";
import { useSessionRefreshTimer } from "./hooks/useSessionRefreshTimer";
import { useAuthStore } from "./stores/authStore";
import { usePendingCheckoutStore } from "./stores/pendingCheckoutStore";
import { useOfflineAuthRevalidate } from "./hooks/useOfflineAuthRevalidate";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 45,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0,
  });
}

function AppBootstrap() {
  useSessionRefreshTimer();
  useOfflineAuthRevalidate();
  useOfflineSync();
  useUfecOperationalResilience();
  useSettings();
  useEffect(() => {
    const stop = startOfflineSyncBootstrap();
    return stop;
  }, []);
  return (
    <>
      <ThemeSync />
      <App />
      <ToastHost />
      <PwaUpdatePrompt />
    </>
  );
}

/** Persist rehydrate + session bootstrap (memory token, optional silent refresh). */
function AuthReadyRoot() {
  const [persistReady, setPersistReady] = useState(
    () => useAuthStore.persist?.hasHydrated?.() ?? false
  );
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setPersistReady(true));
    if (useAuthStore.persist.hasHydrated()) setPersistReady(true);
    return unsub;
  }, []);

  /** If persist never signals (storage edge cases), do not block the shell forever. */
  useEffect(() => {
    const id = setTimeout(() => setPersistReady((prev) => prev || true), 5000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!persistReady) return undefined;
    let cancelled = false;
    const BOOTSTRAP_BUDGET_MS = 15000;
    (async () => {
      try {
        await Promise.race([
          bootstrapAuthSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("bootstrapAuthSession timeout")), BOOTSTRAP_BUDGET_MS)
          ),
        ]);
      } catch {
        // IndexedDB or refresh can stall in some browsers; still show the app shell.
      }
      if (!cancelled) setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persistReady]);

  if (!persistReady || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-600 dark:bg-stone-950 dark:text-stone-400">
        Loading...
      </div>
    );
  }

  return <AppBootstrap />;
}

const rootEl = document.getElementById("root");

async function startApp() {
  const { runIndexedDbVersionGuard } = await import("./offline/indexedDbVersionGuard.js");
  await runIndexedDbVersionGuard();

  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <HelmetProvider>
            <AnalyticsProvider>
              <RegionProvider>
                <AuthReadyRoot />
              </RegionProvider>
            </AnalyticsProvider>
          </HelmetProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

startApp().catch((err) => {
  console.error(err);
  if (!rootEl) return;
  rootEl.textContent = "";
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;padding:1.5rem;text-align:center;font-family:system-ui,sans-serif;background:#fafaf9;color:#292524;";
  const title = document.createElement("p");
  title.style.fontWeight = "600";
  title.textContent = "Could not start offline storage";
  const msg = document.createElement("p");
  msg.style.maxWidth = "28rem";
  msg.style.fontSize = "0.875rem";
  msg.style.color = "#57534e";
  msg.textContent = String(err?.message || err);
  const hint = document.createElement("p");
  hint.style.fontSize = "0.875rem";
  hint.textContent = "Try refreshing the page. If this continues, contact support from Help.";
  wrap.appendChild(title);
  wrap.appendChild(msg);
  wrap.appendChild(hint);
  rootEl.appendChild(wrap);
});

/** Unregister any legacy SW during dev so stale caches do not break HMR. */
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

/** Dev: in console run `__pendingCheckout()` to inspect in-memory checkout rows. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__pendingCheckout = () => usePendingCheckoutStore.getState();
}
