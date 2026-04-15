/**
 * Append-only client integrity event log (IndexedDB). Dedup by `eventId`.
 * @see reconciliationEngine.js — projection must match ledger sums.
 */
import {
  integrityEventGet,
  integrityEventsByTransactionId,
  integrityEventPut,
} from "../services/db.js";
import { hashIntegrityRecord } from "./integrityHash.js";

/**
 * @param {object} event
 * @returns {Promise<{ ok: true, duplicate: boolean, event?: object }>}
 */
export async function emitEvent(event) {
  const row = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  };
  const existing = await integrityEventGet(row.eventId);
  if (existing) {
    return { ok: true, duplicate: true, event: existing };
  }
  const hash = await hashIntegrityRecord(row);
  const stored = { ...row, hash };
  await integrityEventPut(stored);
  return { ok: true, duplicate: false, event: stored };
}

/**
 * @param {string} transactionId — correlate with `client_transaction_id`
 */
export async function getEventsForTransaction(transactionId) {
  const rows = await integrityEventsByTransactionId(transactionId);
  return rows.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
}
