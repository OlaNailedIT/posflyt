import Dexie from "dexie";

/**
 * Dexie DB for Phase 2 **engine metadata / observability only** (e.g. `lastProcessQueueAt`).
 *
 * **Not** the financial queue: sale rows and replay state live **only** in
 * `posflyt-offline-db` → `transactions_queue` (`services/db.js`, idb). Do not store sale payloads here.
 */
class PosflytOfflineMeta extends Dexie {
  constructor() {
    super("posflyt_offline_v1");
    this.version(1).stores({
      engineMeta: "key",
    });
  }
}

export const offlineMetaDb = new PosflytOfflineMeta();

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setEngineMeta(key, value) {
  await offlineMetaDb.engineMeta.put({ key, value, updatedAt: Date.now() });
}

/**
 * @param {string} key
 * @returns {Promise<{ key: string, value: unknown, updatedAt: number } | undefined>}
 */
export async function getEngineMeta(key) {
  return offlineMetaDb.engineMeta.get(key);
}
