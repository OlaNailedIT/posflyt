/**
 * Phase 4 Step 6 — Deterministic recovery orchestration: rehydrate state, re-evaluate consistency,
 * classify recovery — never blind re-execution (replay/sync remains user- or policy-driven).
 */

import { SYNC_STATUS } from "../constants/syncStatus.js";
import {
  getQueuedOutbox,
  getQueuedTransactions,
  getUfecReconciliationQueuePending,
} from "../services/db.js";
import { resolveSyncStatus } from "../services/db.js";
import {
  loadFinancialEventStateContextFromStores,
  resolveFinancialEventState,
} from "./ufecFinancialEventFsm.js";
import { validateSystemConsistency, VIOLATION_TYPE } from "./ufecSystemConsistency.js";
import {
  buildOfflineStorageDegradedSnapshot,
  getOperationalResilienceSnapshot,
  invalidateOperationalResilienceCache,
  UFEC_OPERATIONAL_MODE,
} from "./ufecSystemHealth.js";
import {
  emitSystemHealthObservationFireAndForget,
  reconstructFinancialEventTimeline,
} from "./ufecIfets.js";

export const RECOVERY_CLASSIFICATION = {
  NO_ACTION: "NO_ACTION",
  REPLAY_SYNC: "REPLAY_SYNC",
  RECONCILE_LEDGER: "RECONCILE_LEDGER",
  REBUILD_STATE: "REBUILD_STATE",
  MANUAL_INTERVENTION: "MANUAL_INTERVENTION",
};

/** Priority order (documentation / suggested repair sequencing). */
export const RECOVERY_PRIORITY_ORDER = [
  "RECONCILIATION_QUEUE",
  "LEDGER_DRIFT_FIXES",
  "IDENTITY_IDEMPOTENCY",
  "FSM_ALIGNMENT",
  "SYNC_REPLAY",
  "BACKPRESSURE_NORMALIZATION",
];

function countFailedQueueItems(queue, outbox) {
  const failedTx = queue.filter((item) => resolveSyncStatus(item) === SYNC_STATUS.FAILED).length;
  const failedOb = outbox.filter((item) => item.status === "failed").length;
  return failedTx + failedOb;
}

/**
 * Full cold-start / periodic self-heal entry (no execution retries).
 */
export async function runColdStartResilience() {
  try {
    invalidateOperationalResilienceCache();
    const [queue, outbox, recon] = await Promise.all([
      getQueuedTransactions(),
      getQueuedOutbox(),
      getUfecReconciliationQueuePending(),
    ]);
    const failedQueueItems = countFailedQueueItems(queue, outbox);
    const snapshot = await getOperationalResilienceSnapshot({
      force: true,
      includeIdempotencySample: true,
      queueDepth: queue.length + outbox.length,
      reconBacklog: recon.length,
      failedQueueItems,
      lastBatchDurationMs: 0,
      idempotencyPressure: false,
    });
    emitSystemHealthObservationFireAndForget(snapshot);
    return runSystemRecovery(null, { snapshot });
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[UFEC] cold start degraded — offline storage read failed", err);
    }
    invalidateOperationalResilienceCache();
    const snapshot = await buildOfflineStorageDegradedSnapshot(err);
    emitSystemHealthObservationFireAndForget(snapshot);
    try {
      return await runSystemRecovery(null, { snapshot });
    } catch (e2) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[UFEC] recovery step skipped after degraded snapshot", e2);
      }
      return {
        classification: RECOVERY_CLASSIFICATION.NO_ACTION,
        degraded: true,
        idbStatus: "DEGRADED",
      };
    }
  }
}

export async function runRecoveryLoop() {
  return runColdStartResilience();
}

/**
 * @param {string|null|undefined} globalEventId
 * @param {{ snapshot?: object }} [opts]
 */
export async function runSystemRecovery(globalEventId, opts = {}) {
  if (globalEventId) {
    const gid = String(globalEventId);
    const ctx = await loadFinancialEventStateContextFromStores(gid);
    const resolved = resolveFinancialEventState(ctx);
    const cons = validateSystemConsistency(ctx);
    let timeline = [];
    try {
      timeline = await reconstructFinancialEventTimeline(gid);
    } catch {
      timeline = [];
    }

    /** @type {string} */
    let classification = RECOVERY_CLASSIFICATION.NO_ACTION;
    if (!cons.isConsistent) {
      const v = cons.violations || [];
      if (v.some((x) => x.type === VIOLATION_TYPE.IDENTITY_CONFLICT)) {
        classification = RECOVERY_CLASSIFICATION.MANUAL_INTERVENTION;
      } else if (v.some((x) => x.severity === "CRITICAL")) {
        classification = RECOVERY_CLASSIFICATION.REBUILD_STATE;
      } else if (
        v.some(
          (x) =>
            x.type === VIOLATION_TYPE.FSM_LEDGER_MISMATCH || x.type === VIOLATION_TYPE.RECONCILIATION_STALL
        )
      ) {
        classification = RECOVERY_CLASSIFICATION.RECONCILE_LEDGER;
      } else {
        classification = RECOVERY_CLASSIFICATION.REBUILD_STATE;
      }
    }

    return {
      classification,
      globalEventId: gid,
      resolvedFsm: resolved,
      consistency: cons,
      ifetsTimelineLength: timeline.length,
      suggestedPriority: RECOVERY_PRIORITY_ORDER,
    };
  }

  const snapshot =
    opts.snapshot ||
    (await (async () => {
      const [queue, outbox, recon] = await Promise.all([
        getQueuedTransactions(),
        getQueuedOutbox(),
        getUfecReconciliationQueuePending(),
      ]);
      const failedQueueItems = countFailedQueueItems(queue, outbox);
      return getOperationalResilienceSnapshot({
        force: true,
        includeIdempotencySample: true,
        queueDepth: queue.length + outbox.length,
        reconBacklog: recon.length,
        failedQueueItems,
      });
    })());

  /** @type {string} */
  let classification = RECOVERY_CLASSIFICATION.NO_ACTION;
  const qd = snapshot.signals?.queueDepth ?? 0;
  const rb = snapshot.signals?.reconBacklog ?? 0;

  if (snapshot.operationalMode === UFEC_OPERATIONAL_MODE.FREEZE && snapshot.healthScore < 30) {
    classification = RECOVERY_CLASSIFICATION.MANUAL_INTERVENTION;
  } else if (rb > 25) {
    classification = RECOVERY_CLASSIFICATION.RECONCILE_LEDGER;
  } else if (qd > 0 && snapshot.healthScore >= 40) {
    classification = RECOVERY_CLASSIFICATION.REPLAY_SYNC;
  } else if (snapshot.healthScore < 50 && snapshot.signals?.reconcileRequiredStuckCount > 5) {
    classification = RECOVERY_CLASSIFICATION.RECONCILE_LEDGER;
  }

  return {
    classification,
    snapshot,
    suggestedPriority: RECOVERY_PRIORITY_ORDER,
  };
}
