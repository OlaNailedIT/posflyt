import { postIndexedDBBackup } from "./api";
import { exportIndexedDBFullSnapshot } from "./db";
import { getStoredAuthTokenSync } from "../utils/authToken";
import { useAuthStore } from "../stores/authStore";

const LS_LAST_AUTO_KEY = "posflyt_last_indexeddb_cloud_backup_at";
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Best-effort cloud backup after sync (admin only, throttled, non-blocking).
 */
export async function maybeAutoIndexedDBBackup() {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!getStoredAuthTokenSync()) return;
  const role = useAuthStore.getState().user?.role;
  if (role !== "ADMIN") return;

  const now = Date.now();
  const last = Number(localStorage.getItem(LS_LAST_AUTO_KEY) || 0);
  if (last && now - last < AUTO_INTERVAL_MS) return;

  try {
    const snapshot = await exportIndexedDBFullSnapshot();
    await postIndexedDBBackup(snapshot);
    localStorage.setItem(LS_LAST_AUTO_KEY, String(now));
  } catch (e) {
    console.warn("Auto IndexedDB cloud backup failed", e);
  }
}
