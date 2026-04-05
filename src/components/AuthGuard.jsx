import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { getStoredAuthTokenSync } from "../utils/authToken";

/**
 * Lightweight client guard: token must exist (persisted) after hydration.
 * Does not validate JWT with the server.
 */
export default function AuthGuard({ children }) {
  const [ready, setReady] = useState(() => useAuthStore.persist?.hasHydrated?.() ?? false);
  const tokenFromStore = useAuthStore((s) => s.token);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setReady(true));
    if (useAuthStore.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-600 dark:bg-stone-950 dark:text-stone-400">
        Loading...
      </div>
    );
  }

  const token = tokenFromStore || getStoredAuthTokenSync();
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
