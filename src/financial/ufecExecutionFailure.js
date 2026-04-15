/**
 * Phase 3 Step 2 — Central execution failure router.
 */

import { IDEMPOTENCY_STATUS } from "./ufecIdempotencyRegistry.js";
import {
  classifyUfecFailure,
  FAILURE_CLASS,
  failureSignature,
} from "./ufecFailureClassification.js";
import {
  applyJitterMs,
  computeBackoffMs,
  MAX_UFEC_RETRIES,
} from "./ufecRetryPolicy.js";
import { recordUfecRetryAttempt, getUfecRetryThrottleState } from "./ufecRetryCooldown.js";
import { UFEC_WRITE_SOURCE } from "./ufecConcurrency.js";
import {
  getGlobalEventId,
  loadUfecIdempotencyEntry,
  persistUfecIdempotencyEntry,
} from "./ufecIdempotencyRegistry.js";
import {
  loadFinancialEventStateContextFromStores,
  logUfecFsm,
  resolveFinancialEventState,
} from "./ufecFinancialEventFsm.js";

const MAX_SAME_SIGNATURE_STREAK = 3;

/**
 * @param {object} event
 * @param {unknown} error
 */
export async function handleUfecExecutionFailure(event, error) {
  const gid = getGlobalEventId(event);

  if (error?.isUfecIdempotency === true) {
    return;
  }

  const prev = (await loadUfecIdempotencyEntry(gid)) || {
    global_event_id: gid,
    retryCount: 0,
  };

  const { class: failureClass, reason } = classifyUfecFailure(error);
  const sig = failureSignature(error);
  const sameSig = prev.lastFailureSignature === sig;
  const streak = sameSig ? Number(prev.consecutiveSameSignature || 0) + 1 : 1;

  try {
    if (failureClass === FAILURE_CLASS.DEGRADED) {
      await persistUfecIdempotencyEntry(
        {
          ...prev,
          global_event_id: gid,
          status: IDEMPOTENCY_STATUS.RECONCILE_REQUIRED,
          lastExecutionTimestamp: Date.now(),
          failureClass,
          failureReason: reason,
          lastFailureSignature: sig,
          consecutiveSameSignature: streak,
          nextRetryAtMs: undefined,
        },
        { writeSource: UFEC_WRITE_SOURCE.EXECUTION }
      );
      console.info("[UFEC_FLAG]", {
        type: "UFEC_FLAG",
        kind: "DEGRADED_FAILURE",
        global_event_id: gid,
        reason,
      });
      return;
    }

    if (failureClass === FAILURE_CLASS.NON_RETRYABLE) {
      await persistUfecIdempotencyEntry(
        {
          ...prev,
          global_event_id: gid,
          status: IDEMPOTENCY_STATUS.FAILED_FINAL,
          lastExecutionTimestamp: Date.now(),
          failureClass,
          failureReason: reason,
          lastFailureSignature: sig,
          nextRetryAtMs: undefined,
        },
        { writeSource: UFEC_WRITE_SOURCE.EXECUTION }
      );
      console.info("[UFEC_FLAG]", {
        type: "UFEC_FLAG",
        kind: "NON_RETRYABLE_FAILURE",
        global_event_id: gid,
        reason,
      });
      return;
    }

    const nextRetryCount = Number(prev.retryCount || 0) + 1;

    if (nextRetryCount > MAX_UFEC_RETRIES || streak >= MAX_SAME_SIGNATURE_STREAK) {
      await persistUfecIdempotencyEntry(
        {
          ...prev,
          global_event_id: gid,
          status: IDEMPOTENCY_STATUS.RECONCILE_REQUIRED,
          lastExecutionTimestamp: Date.now(),
          retryCount: nextRetryCount,
          failureClass,
          failureReason: streak >= MAX_SAME_SIGNATURE_STREAK ? "repeated_signature" : "max_retries",
          lastFailureSignature: sig,
          consecutiveSameSignature: streak,
          nextRetryAtMs: undefined,
        },
        { writeSource: UFEC_WRITE_SOURCE.EXECUTION }
      );
      console.info("[UFEC_FLAG]", {
        type: "UFEC_FLAG",
        kind: "ESCALATE_RECONCILE",
        global_event_id: gid,
        reason: nextRetryCount > MAX_UFEC_RETRIES ? "retry_cap" : "signature_streak",
      });
      return;
    }

    recordUfecRetryAttempt();
    const throttle = getUfecRetryThrottleState();
    let backoff = applyJitterMs(computeBackoffMs(nextRetryCount));
    if (throttle.throttle) {
      backoff += throttle.extraDelayMs;
    }
    const nextRetryAtMs = Date.now() + backoff;

    await persistUfecIdempotencyEntry(
      {
        ...prev,
        global_event_id: gid,
        status: IDEMPOTENCY_STATUS.FAILED_RETRYABLE,
        lastExecutionTimestamp: Date.now(),
        retryCount: nextRetryCount,
        failureClass,
        failureReason: reason,
        lastFailureSignature: sig,
        consecutiveSameSignature: streak,
        nextRetryAtMs,
        backoffMsApplied: backoff,
      },
      { writeSource: UFEC_WRITE_SOURCE.EXECUTION }
    );
  } finally {
    const ctx = await loadFinancialEventStateContextFromStores(gid);
    logUfecFsm(resolveFinancialEventState(ctx));
  }
}
