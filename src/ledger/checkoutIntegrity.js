/**
 * Checkout → client integrity shadow (Phase 3): append-only events + projected ledger in IndexedDB.
 * Server Postgres / API remains the commerce system of record; this layer supports audit + offline rebuild checks.
 * UFEC queue replay also calls `recordSaleAppliedIntegrity` from `useOfflineSync` so “headless” sync is covered.
 * Best-effort — failures do not block sales.
 */
import { INTEGRITY_EVENT } from "./integrityConstants.js";
import { emitIntegrityEventAndProjectLedger } from "./integrityPipeline.js";

/**
 * Server path (or reconcile): sale materially applied / duplicate.
 */
export async function recordSaleAppliedIntegrity(opts) {
  const {
    transactionId,
    totalAmount,
    source,
    duplicate = false,
    serverTransactionId = null,
  } = opts;
  const eventId = `${transactionId}:${INTEGRITY_EVENT.SALE_APPLIED}`;
  await emitIntegrityEventAndProjectLedger({
    eventId,
    transactionId,
    type: INTEGRITY_EVENT.SALE_APPLIED,
    payload: {
      totalAmount,
      duplicate: Boolean(duplicate),
      serverTransactionId,
    },
    source,
    timestamp: Date.now(),
  });
}

/**
 * Recoverable offline queue path.
 */
export async function recordSaleQueuedOfflineIntegrity(opts) {
  const { transactionId, totalAmount, payloadHash = null } = opts;
  const eventId = `${transactionId}:${INTEGRITY_EVENT.SALE_QUEUED_OFFLINE}`;
  await emitIntegrityEventAndProjectLedger({
    eventId,
    transactionId,
    type: INTEGRITY_EVENT.SALE_QUEUED_OFFLINE,
    payload: { totalAmount, payloadHash },
    source: "checkout",
    timestamp: Date.now(),
  });
}
