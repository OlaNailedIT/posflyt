/**
 * Phase 2 sync engine — **one** imperative entry that drives UFEC replay (`useOfflineSync` → `runSync`).
 * Does not POST transactions directly (avoids duplicating `syncReplay` / idempotency rules).
 */
import { setEngineMeta } from "./db";
import { requestOfflineSync } from "./syncCoordinator";
import { emitCheckoutTelemetry } from "../utils/checkoutTelemetry";

/**
 * @param {{ force?: boolean }} [options]
 */
export async function processQueue(options = {}) {
  const { force = false } = options;
  await setEngineMeta("lastProcessQueueAt", Date.now());
  emitCheckoutTelemetry("OFFLINE_QUEUE_SYNC_REQUEST", { force });
  await requestOfflineSync(force);
}
