/**
 * @typedef {{
 *   eventId: string,
 *   transactionId: string,
 *   type: string,
 *   payload: Record<string, unknown>,
 *   source: 'checkout' | 'sync' | 'reconcile',
 *   timestamp: number,
 *   hash: string
 * }} IntegrityEvent
 */

/**
 * @typedef {{
 *   ledgerId: string,
 *   transactionId: string,
 *   debit: number,
 *   credit: number,
 *   type: 'SALE' | 'REFUND' | 'ADJUSTMENT',
 *   referenceEventId: string,
 *   balanceAfter: number,
 *   timestamp: number
 * }} IntegrityLedgerEntry
 */

export {};
