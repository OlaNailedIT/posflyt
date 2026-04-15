/**
 * Phase 3 Step 3 — Reconciliation queue: durable repair intent (not execution retry).
 */

import {
  enqueueUfecReconciliationQueueRow,
  getUfecReconciliationQueuePending,
} from "../services/db.js";
import { emitReconciliationEnqueueObservation } from "./ufecIfets.js";
import { getDeterministicRepairPlan } from "./ufecReconciliationEngine.js";

function fingerprintApiResult(raw) {
  try {
    const s = JSON.stringify(raw);
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return { byteLen: s.length, fp: String(h) };
  } catch {
    return { fp: `t:${Date.now()}` };
  }
}

/**
 * @param {{
 *   globalEventId: string,
 *   eventType: string,
 *   convergence: object,
 *   ledgerBundle: { expected?: object, actual?: unknown, comparison: object },
 *   rawResult: unknown,
 * }} args
 */
export async function persistUfecReconciliationArtifacts(args) {
  const { globalEventId, eventType, convergence, ledgerBundle, rawResult } = args;
  const pending = await getUfecReconciliationQueuePending();
  if (pending.some((r) => r.globalEventId === globalEventId)) {
    return null;
  }
  const plan = getDeterministicRepairPlan(convergence.driftType);
  const row = await enqueueUfecReconciliationQueueRow({
    globalEventId,
    eventType,
    convergenceState: convergence.state,
    driftType: convergence.driftType,
    severity: convergence.severity,
    divergenceReason: convergence.divergenceReason,
    expectedLedgerOutcome: convergence.expectedLedgerOutcome,
    actualLedgerOutcome: convergence.actualLedgerOutcome,
    repairAction: plan.repairAction,
    repairRule: plan.rule,
    ledgerComparison: {
      status: ledgerBundle?.comparison?.status,
      details: ledgerBundle?.comparison?.details,
      enforcementLevel: ledgerBundle?.comparison?.enforcementLevel,
    },
    expectedSummary: ledgerBundle?.expected,
    actualSummary: ledgerBundle?.actual,
    apiFingerprint: fingerprintApiResult(rawResult),
    status: "pending",
  });
  if (row) emitReconciliationEnqueueObservation(globalEventId);
  return row;
}
