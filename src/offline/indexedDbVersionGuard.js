import { logSchemaDrift } from "../utils/schemaDriftLog.js";

const OVERLAY_ID = "posflyt-idb-upgrade-overlay";
const RELOAD_FLAG = "posflyt_idb_post_upgrade_reload";

function showUpgradeOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;padding:1.5rem;text-align:center;background:rgba(28,25,23,0.92);color:#fff;font-family:system-ui,sans-serif;";
  el.innerHTML =
    "<p style=\"font-size:1.125rem;font-weight:600;margin:0;\">Updating app data safely…</p><p style=\"font-size:0.875rem;max-width:24rem;margin:0;color:#d6d3d1;\">This keeps offline sales and sync reliable. One moment.</p>";
  document.body.appendChild(el);
}

function hideUpgradeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * @param {string} name
 * @returns {Promise<number>}
 */
async function getCurrentIndexedDbVersion(name) {
  try {
    if (typeof indexedDB.databases === "function") {
      const list = await indexedDB.databases();
      const found = list.find((d) => d.name === name);
      return found ? Number(found.version) : 0;
    }
  } catch {
    // fall through to open()
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const v = req.result.version;
      req.result.close();
      resolve(Number(v));
    };
  });
}

/**
 * Ensures IndexedDB is at the same version as `OFFLINE_DB_VERSION` in `db.js` before the rest of the app runs.
 * Triggers idb upgrade + one reload when the client was behind.
 */
export async function runIndexedDbVersionGuard() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  const { OFFLINE_DB_NAME, OFFLINE_DB_VERSION, openOfflineDatabase } = await import("../services/db.js");

  let current;
  try {
    current = await getCurrentIndexedDbVersion(OFFLINE_DB_NAME);
  } catch (e) {
    logSchemaDrift({ layer: "indexeddb", kind: "version_read_failed", error: String(e?.message || e) });
    throw e;
  }

  if (current > OFFLINE_DB_VERSION) {
    logSchemaDrift({
      layer: "indexeddb",
      kind: "version_ahead",
      current,
      expected: OFFLINE_DB_VERSION,
    });
    throw new Error(
      "This build is older than your saved offline data. Use the latest app version, or ask support if you need to reset offline storage."
    );
  }

  if (current < OFFLINE_DB_VERSION) {
    showUpgradeOverlay();
    if (typeof window !== "undefined") {
      window.__POSFLYT_IDB_UPGRADING__ = true;
    }
    try {
      await openOfflineDatabase();
      logSchemaDrift({
        layer: "indexeddb",
        kind: "upgraded",
        from: current,
        to: OFFLINE_DB_VERSION,
      });
    } catch (e) {
      logSchemaDrift({
        layer: "indexeddb",
        kind: "upgrade_failed",
        from: current,
        expected: OFFLINE_DB_VERSION,
        error: String(e?.message || e),
      });
      hideUpgradeOverlay();
      if (typeof window !== "undefined") {
        window.__POSFLYT_IDB_UPGRADING__ = false;
      }
      throw e;
    } finally {
      if (typeof window !== "undefined") {
        window.__POSFLYT_IDB_UPGRADING__ = false;
      }
    }
    hideUpgradeOverlay();
    try {
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      // private mode
    }
    window.location.reload();
    return new Promise(() => {});
  }

  await openOfflineDatabase();
}
