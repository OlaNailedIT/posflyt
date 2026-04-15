/**
 * Maps integrity events → projected ledger lines (deterministic rebuild input).
 */
import { INTEGRITY_EVENT, INTEGRITY_LEDGER_TYPE } from "./integrityConstants.js";

/**
 * @param {import('./integrityTypes.js').IntegrityEvent} event
 * @returns {import('./integrityTypes.js').IntegrityLedgerEntry[]}
 */
export function buildLedgerEntriesFromEvent(event) {
  switch (event.type) {
    case INTEGRITY_EVENT.SALE_QUEUED_OFFLINE:
      return [];
    case INTEGRITY_EVENT.SALE_APPLIED: {
      const total = Number(event.payload?.totalAmount ?? event.payload?.total ?? 0);
      const safe = Number.isFinite(total) ? total : 0;
      const ledgerId = `${event.transactionId}::ledger::SALE::${event.eventId}`;
      return [
        {
          ledgerId,
          transactionId: event.transactionId,
          debit: 0,
          credit: Math.max(0, safe),
          type: INTEGRITY_LEDGER_TYPE.SALE,
          referenceEventId: event.eventId,
          balanceAfter: Math.max(0, safe),
          timestamp: event.timestamp,
        },
      ];
    }
    default:
      return [];
  }
}
