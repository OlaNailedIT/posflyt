/**
 * Validates that ledger projection matches deterministic rebuild from events (client audit).
 */
import { emitOfflineTelemetry } from "../utils/offlineTelemetry.js";
import { getEventsForTransaction } from "./eventStore.js";
import { buildLedgerEntriesFromEvent } from "./ledgerBuilder.js";
import { getLedgerEntriesForTransaction } from "./ledgerStore.js";

const EPS = 0.005;

function sumNet(entries) {
  let s = 0;
  for (const e of entries) {
    s += (Number(e.credit) || 0) - (Number(e.debit) || 0);
  }
  return s;
}

/**
 * Rebuild ledger lines from events only (same rules as append pipeline).
 * @param {string} transactionId
 */
export async function rebuildLedgerNetFromEvents(transactionId) {
  const events = await getEventsForTransaction(transactionId);
  const lines = [];
  for (const ev of events) {
    lines.push(...buildLedgerEntriesFromEvent(ev));
  }
  return { net: sumNet(lines), lines };
}

/**
 * @param {string} transactionId — typically `client_transaction_id`
 * @returns {Promise<{ ok: boolean, eventNet: number, ledgerNet: number }>}
 */
export async function reconcileIntegrityForTransaction(transactionId) {
  const { net: eventNet } = await rebuildLedgerNetFromEvents(transactionId);
  const ledgerRows = await getLedgerEntriesForTransaction(transactionId);
  const ledgerNet = sumNet(ledgerRows);

  const ok = Math.abs(eventNet - ledgerNet) < EPS;
  if (!ok) {
    emitOfflineTelemetry("LEDGER_INTEGRITY_MISMATCH", {
      transactionId: transactionId.length > 12 ? `${transactionId.slice(0, 8)}…` : transactionId,
      eventNet,
      ledgerNet,
    });
  }
  return { ok, eventNet, ledgerNet };
}
