import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { getStoredAuthTokenSync } from "../utils/authToken";

type AuthGuardProps = { children: ReactNode };

/**
 * Client guard: persisted auth must be hydrated, then a token must exist.
 * Does not validate JWT with the server.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();
  const [ready, setReady] = useState(
    () => useAuthStore.persist?.hasHydrated?.() ?? false
  );
  const tokenFromStore = useAuthStore((s) => s.token);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setReady(true));
    if (useAuthStore.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-600 dark:bg-stone-950 dark:text-stone-400">
        Checking session…
      </div>
    );
  }

  const token = tokenFromStore || getStoredAuthTokenSync();
  if (!token) {
    const redirect = `${location.pathname}${location.search || ""}`;
    const qs = redirect && redirect !== "/login" ? `?redirect=${encodeURIComponent(redirect)}` : "";
    return <Navigate to={`/login${qs}`} replace />;
  }

  return <>{children}</>;
}
