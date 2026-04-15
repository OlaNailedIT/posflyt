/**
 * Phase 2 Step 7 — UFEC dominance contract (runtime-visible constants).
 *
 * Product-facing financial correctness is owned by the UFEC pipeline:
 *   FinancialEvent → executeFinancialEvent → enforcement → ledger comparison → legacy HTTP.
 *
 * Backend services persist and enforce integrity; they do not replace UFEC as the client
 * decision system. See docs/UFEC_PHASE2_DOMINANCE.md
 */

/** @type {2} */
export const UFEC_DOMINANCE_PHASE = 2;

/** Locked event kinds for representable financial operations (see ufecSyncShadow). */
export const UFEC_REPRESENTABLE_EVENT_KINDS = Object.freeze([
  "SALE_EVENT",
  "RETURN_EVENT",
  "ADJUSTMENT_EVENT",
  "OTHER_SYNC",
]);

/**
 * @param {string} type
 * @returns {boolean}
 */
export function isRepresentableFinancialEventType(type) {
  return UFEC_REPRESENTABLE_EVENT_KINDS.includes(type);
}
