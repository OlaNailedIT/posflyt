import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useSettings } from "./hooks/useSettings";
import ToastHost from "./components/ToastHost";
import ThemeSync from "./components/ThemeSync";
import { RegionProvider } from "./context/RegionContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
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
  useOfflineSync();
  useSettings();
  return (
    <>
      <ThemeSync />
      <App />
      <ToastHost />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RegionProvider>
          <AppBootstrap />
        </RegionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const SW_RELOAD_KEY = "posflyt-sw-activate-reload";

        const promptReload = () => {
          if (typeof window === "undefined") return;
          if (window.confirm("A new version is available. Reload to update?")) {
            sessionStorage.setItem(SW_RELOAD_KEY, "1");
            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }
          }
        };

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              promptReload();
            }
          });
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          promptReload();
        }

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (sessionStorage.getItem(SW_RELOAD_KEY) !== "1") return;
          sessionStorage.removeItem(SW_RELOAD_KEY);
          window.location.reload();
        });
      })
      .catch(() => {});
  });
}
