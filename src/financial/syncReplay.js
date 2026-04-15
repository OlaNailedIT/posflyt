/**
 * Phase 2 Step 6–7 — Stateless replay: queue/outbox → FinancialEvent → executeFinancialEvent only.
 * No domain branching here; orchestration (mark synced, retries) stays in useOfflineSync.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

import {
  createReturnFinancialEvent,
  createSaleFinancialEvent,
  executeFinancialEvent,
} from "./executeFinancialEvent.js";
import { hydrateCanonicalOrderFromQueueRow } from "./ufecCanonicalOrder.js";

/**
 * Replay a queued offline sale row (transactions_queue payload).
 * @param {object} payload — POST /transactions body
 * @param {{ client_transaction_id?: string }} item — queue row (for legacy id fallback)
 */
export function replayQueuedTransactionSale(payload, item) {
  const clientEventId = payload?.client_transaction_id || item?.client_transaction_id || item?.id;
  const saleEvent = createSaleFinancialEvent({ clientEventId, payload });
  hydrateCanonicalOrderFromQueueRow(saleEvent, item);
  return executeFinancialEvent(saleEvent);
}

/**
 * Replay POST_RETURN outbox body.
 * @param {object} body — return API body (client_return_id, original_transaction_id, …)
 * @param {string} outboxRowId — durable row id fallback for clientEventId
 * @param {object} [outboxRow] — full outbox row (for CFEOS fields from enqueue)
 */
export function replayOutboxReturn(body, outboxRowId, outboxRow) {
  const ob = body || {};
  const clientEventId = ob.client_return_id || ob.client_transaction_id || outboxRowId;
  const returnEvent = createReturnFinancialEvent({
    clientEventId,
    original_transaction_id: ob.original_transaction_id,
    items: ob.items,
  });
  hydrateCanonicalOrderFromQueueRow(returnEvent, outboxRow);
  return executeFinancialEvent(returnEvent);
}
