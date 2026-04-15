/**
 * Append-only projected ledger rows (client shadow). Idempotent by `ledgerId`.
 */
import {
  integrityLedgerByTransactionId,
  integrityLedgerGet,
  integrityLedgerPut,
} from "../services/db.js";

/**
 * @param {import('./integrityTypes.js').IntegrityLedgerEntry} entry
 * @returns {Promise<{ ok: true, duplicate: boolean }>}
 */
export async function appendLedgerEntry(entry) {
  const existing = await integrityLedgerGet(entry.ledgerId);
  if (existing) {
    return { ok: true, duplicate: true };
  }
  await integrityLedgerPut({
    ...entry,
    timestamp: entry.timestamp ?? Date.now(),
  });
  return { ok: true, duplicate: false };
}

/**
 * @param {string} transactionId
 */
export async function getLedgerEntriesForTransaction(transactionId) {
  const rows = await integrityLedgerByTransactionId(transactionId);
  return rows.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
}
