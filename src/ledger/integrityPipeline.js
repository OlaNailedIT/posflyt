/**
 * Emit one integrity event and append projected ledger rows (idempotent).
 */
import { emitEvent } from "./eventStore.js";
import { buildLedgerEntriesFromEvent } from "./ledgerBuilder.js";
import { appendLedgerEntry } from "./ledgerStore.js";

/**
 * @param {Omit<import('./integrityTypes.js').IntegrityEvent, 'hash'> & { hash?: string }} partial
 */
export async function emitIntegrityEventAndProjectLedger(partial) {
  const out = await emitEvent(partial);
  if (out.duplicate || !out.event) {
    return out;
  }
  const entries = buildLedgerEntriesFromEvent(out.event);
  for (const e of entries) {
    await appendLedgerEntry(e);
  }
  return out;
}
