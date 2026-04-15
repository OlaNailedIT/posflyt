/**
 * Phase 3 Step 3 — Deterministic repair classification (no blind retries, no re-execution).
 * Actual correction I/O is deferred to server-side repair jobs / manual flows; client records intent.
 */

import { DRIFT_TYPE } from "./ufecLedgerConvergence.js";

export const REPAIR_ACTION = {
  /** Post ADJUSTMENT_EVENT / settlement-style correction (amount drift). */
  ADJUSTMENT_EVENT: "ADJUSTMENT_EVENT",
  /** Rebuild ledger projection from durable execution / idempotency snapshot. */
  REHYDRATE_FROM_EXECUTION_LOG: "REHYDRATE_FROM_EXECUTION_LOG",
  /** Collapse duplicates + neutralizing ledger lines (server-led). */
  NEUTRALIZE_DUPLICATES: "NEUTRALIZE_DUPLICATES",
  /** Canonical UFEC ordering wins over storage order. */
  ENFORCE_CANONICAL_ORDER: "ENFORCE_CANONICAL_ORDER",
  /** Full rebuild from canonical FinancialEvent source. */
  REBUILD_LEDGER_FROM_EVENT: "REBUILD_LEDGER_FROM_EVENT",
};

/**
 * @param {string|null} driftType — DRIFT_TYPE.* or null
 * @returns {{ repairAction: string, rule: string }}
 */
export function getDeterministicRepairPlan(driftType) {
  switch (driftType) {
    case DRIFT_TYPE.AMOUNT_DRIFT:
      return { repairAction: REPAIR_ACTION.ADJUSTMENT_EVENT, rule: "AMOUNT_DRIFT→adjustment" };
    case DRIFT_TYPE.MISSING_LEDGER_ENTRY:
      return {
        repairAction: REPAIR_ACTION.REHYDRATE_FROM_EXECUTION_LOG,
        rule: "MISSING_LEDGER_ENTRY→rehydrate",
      };
    case DRIFT_TYPE.DUPLICATE_LEDGER_ENTRY:
      return {
        repairAction: REPAIR_ACTION.NEUTRALIZE_DUPLICATES,
        rule: "DUPLICATE_LEDGER_ENTRY→neutralize",
      };
    case DRIFT_TYPE.ORDER_DRIFT:
      return {
        repairAction: REPAIR_ACTION.ENFORCE_CANONICAL_ORDER,
        rule: "ORDER_DRIFT→canonical_order",
      };
    case DRIFT_TYPE.PARTIAL_APPLY:
      return {
        repairAction: REPAIR_ACTION.REBUILD_LEDGER_FROM_EVENT,
        rule: "PARTIAL_APPLY→rebuild_from_event",
      };
    default:
      return {
        repairAction: REPAIR_ACTION.REBUILD_LEDGER_FROM_EVENT,
        rule: "UNKNOWN→rebuild_or_manual",
      };
  }
}
