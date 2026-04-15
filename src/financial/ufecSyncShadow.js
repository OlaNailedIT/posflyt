/**
 * Phase 2 — UFEC sync instrumentation (shadow only).
 * Observe → normalize → compare → log. No blocking, no queue changes.
 * Transaction queue + sync replay use SALE_EVENT (see executeFinancialEvent); outbox POST_RETURN uses RETURN_EVENT.
 */

import { isRecoverableNetworkError } from "../utils/networkError.js";

/** @typedef {'SALE_EVENT'|'RETURN_EVENT'|'ADJUSTMENT_EVENT'|'OTHER_SYNC'} FinancialEventType */

/** @typedef {'SUCCESS'|'RETRYABLE'|'REJECTED'|'RECONCILE_REQUIRED'} FinancialExecutionResult */

export const FINANCIAL_EVENT_TYPE = {
  SALE_EVENT: "SALE_EVENT",
  RETURN_EVENT: "RETURN_EVENT",
  ADJUSTMENT_EVENT: "ADJUSTMENT_EVENT",
  OTHER_SYNC: "OTHER_SYNC",
};

export const EXECUTION_RESULT = {
  SUCCESS: "SUCCESS",
  RETRYABLE: "RETRYABLE",
  REJECTED: "REJECTED",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
};

const DRIFT = {
  MATCH: "DRIFT_MATCH",
  MISMATCH: "DRIFT_MISMATCH",
  EXECUTION_DIFFERENCE: "EXECUTION_DIFFERENCE",
};

function shouldLogUfecShadow() {
  if (import.meta.env.VITE_UFEC_SYNC_SHADOW_DEBUG === "1") return true;
  if (import.meta.env.VITE_UFEC_SYNC_SHADOW_DEBUG === "0") return false;
  return import.meta.env.DEV;
}

function isUuidLike(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * In-memory FinancialEvent envelope (not persisted).
 * @param {FinancialEventType} type
 * @param {string} clientEventId
 * @param {{ source: string, queue: string, outboxKind?: string }} meta
 */
export function createFinancialEvent(type, clientEventId, meta = {}) {
  return {
    type,
    clientEventId,
    source: meta.source || "sync",
    queue: meta.queue,
    outboxKind: meta.outboxKind,
  };
}

/**
 * @param {object} item — queued transaction row
 * @param {object} payload
 */
export function normalizeTransactionQueueToFinancialEvent(item, payload) {
  const clientEventId = payload?.client_transaction_id || item?.client_transaction_id || item?.id;
  return createFinancialEvent(FINANCIAL_EVENT_TYPE.SALE_EVENT, clientEventId, {
    source: "sync",
    queue: "transaction",
  });
}

/**
 * @param {object} item — outbox row
 */
export function normalizeOutboxToFinancialEvent(item) {
  const kind = item?.kind;
  if (kind === "POST_RETURN") {
    const body = item.body || {};
    const clientEventId = body.client_return_id || body.client_transaction_id || item.id;
    return createFinancialEvent(FINANCIAL_EVENT_TYPE.RETURN_EVENT, clientEventId, {
      source: "sync",
      queue: "outbox",
      outboxKind: kind,
    });
  }
  if (kind === "SETTLE_PAYMENT" || kind === "SETTLE_CUSTOMER_CREDIT") {
    return createFinancialEvent(FINANCIAL_EVENT_TYPE.ADJUSTMENT_EVENT, item.id, {
      source: "sync",
      queue: "outbox",
      outboxKind: kind,
    });
  }
  return createFinancialEvent(FINANCIAL_EVENT_TYPE.OTHER_SYNC, item.id, {
    source: "sync",
    queue: "outbox",
    outboxKind: kind,
  });
}

/**
 * Shadow stages (no I/O, no writes).
 * @param {ReturnType<typeof createFinancialEvent>} event
 * @param {object} payloadOrBody
 */
export function simulateUfecShadowStages(event, payloadOrBody) {
  const stages = {
    intake: { ok: true },
    idempotency: {
      shadowKeyPresent: Boolean(event.clientEventId),
      uuidShape: isUuidLike(String(event.clientEventId || "")),
    },
    classify: { eventType: event.type },
    validate: {},
    ledgerSim: { wouldAppendOnly: true, note: "no write in shadow" },
    domainSim: { wouldApplyDomainMutation: true, note: "no apply in shadow" },
  };

  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    stages.validate = {
      hasItems: Array.isArray(payloadOrBody?.items) && payloadOrBody.items.length > 0,
      hasClientTransactionId: Boolean(payloadOrBody?.client_transaction_id),
    };
    stages.ledgerSim = {
      ...stages.ledgerSim,
      conceptualDirection: "credit",
    };
    stages.domainSim = {
      ...stages.domainSim,
      conceptualEffect: "inventory_decrement",
    };
  } else if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    stages.validate = {
      hasOriginalTx: Boolean(payloadOrBody?.original_transaction_id),
      hasReturnId: Boolean(payloadOrBody?.client_return_id || payloadOrBody?.client_transaction_id),
    };
    stages.ledgerSim = {
      ...stages.ledgerSim,
      conceptualDirection: "reversal",
    };
    stages.domainSim = {
      ...stages.domainSim,
      conceptualEffect: "inventory_increment",
    };
  } else {
    stages.validate = { passthrough: true };
    stages.ledgerSim.conceptualDirection = "neutral";
    stages.domainSim.conceptualEffect = "none_or_custom";
  }

  return stages;
}

/** @returns {FinancialExecutionResult} */
export function financialExecutionResultFromTransactionSyncDetail(detail) {
  if (!detail || detail.outcome === "unknown") return EXECUTION_RESULT.RETRYABLE;
  if (detail.outcome === "synced") return EXECUTION_RESULT.SUCCESS;
  if (detail.outcome === "pending") return EXECUTION_RESULT.RETRYABLE;
  if (detail.outcome === "failed") {
    const code = detail.syncCode || detail.error?.response?.data?.code;
    if (code === "INSUFFICIENT_STOCK" || code === "INVENTORY_CONFLICT") {
      return EXECUTION_RESULT.RECONCILE_REQUIRED;
    }
    if (isRecoverableNetworkError(detail.error)) return EXECUTION_RESULT.RETRYABLE;
    return EXECUTION_RESULT.REJECTED;
  }
  return EXECUTION_RESULT.REJECTED;
}

/** Canonical UFEC interpretation (same rules as legacy mapping for tx sync — drift-free baseline). */
function ufecCanonicalTransactionResult(detail) {
  return financialExecutionResultFromTransactionSyncDetail(detail);
}

/** @returns {FinancialExecutionResult} */
export function financialExecutionResultFromOutboxDetail(detail) {
  if (!detail || detail.outcome === "unknown") return EXECUTION_RESULT.RETRYABLE;
  if (detail.outcome === "success") return EXECUTION_RESULT.SUCCESS;
  if (detail.outcome === "failed") {
    const code = detail.code || detail.error?.response?.data?.code;
    if (code === "CONFLICT") return EXECUTION_RESULT.REJECTED;
    if (
      code === "INSUFFICIENT_STOCK" ||
      code === "INVENTORY_CONFLICT" ||
      code === "RETURN_QTY_EXCEEDED" ||
      code === "ALREADY_FULLY_RETURNED"
    ) {
      return EXECUTION_RESULT.RECONCILE_REQUIRED;
    }
    if (isRecoverableNetworkError(detail.error)) return EXECUTION_RESULT.RETRYABLE;
    return EXECUTION_RESULT.REJECTED;
  }
  return EXECUTION_RESULT.REJECTED;
}

function ufecCanonicalOutboxResult(detail) {
  return financialExecutionResultFromOutboxDetail(detail);
}

function logShadowLine(payload) {
  if (!shouldLogUfecShadow()) return;
  console.info("[UFEC_SYNC_SHADOW]", payload);
}

/**
 * @param {object} item — queue row
 * @param {object} payload
 * @param {{ outcome: 'synced'|'pending'|'failed'|'unknown', response?: object, error?: Error, first?: object, syncCode?: string|null }} detail
 */
export function reportUfecShadowTransactionSync(item, payload, detail) {
  const event = normalizeTransactionQueueToFinancialEvent(item, payload);
  const stages = simulateUfecShadowStages(event, payload);
  const legacyResult = financialExecutionResultFromTransactionSyncDetail(detail);
  const ufecResult = ufecCanonicalTransactionResult(detail);
  const match = legacyResult === ufecResult;
  const driftType = match ? DRIFT.MATCH : DRIFT.MISMATCH;

  let driftStage = null;
  if (!match) {
    if (legacyResult !== ufecResult) driftStage = "classification";
  }

  logShadowLine({
    kind: driftType,
    channel: "transaction_queue",
    eventType: event.type,
    queueUfecEventType: item?.ufecEventType ?? null,
    clientEventId: event.clientEventId,
    legacyExecutionResult: legacyResult,
    ufecExecutionResult: ufecResult,
    executionDifference: !match ? { legacyResult, ufecResult } : undefined,
    driftStage,
    stages,
    detailSummary: {
      outcome: detail?.outcome,
      syncCode: detail?.syncCode || null,
    },
  });

  if (!match) {
    logShadowLine({
      kind: DRIFT.EXECUTION_DIFFERENCE,
      channel: "transaction_queue",
      clientEventId: event.clientEventId,
      legacyExecutionResult: legacyResult,
      ufecExecutionResult: ufecResult,
    });
  }
}

/**
 * @param {object} item — outbox row
 * @param {{ outcome: 'success'|'failed'|'unknown', error?: Error, code?: string|null }} detail
 */
export function reportUfecShadowOutbox(item, detail) {
  const event = normalizeOutboxToFinancialEvent(item);
  const body = item.body || {};
  const stages = simulateUfecShadowStages(event, body);
  const legacyResult = financialExecutionResultFromOutboxDetail(detail);
  const ufecResult = ufecCanonicalOutboxResult(detail);
  const match = legacyResult === ufecResult;
  const driftType = match ? DRIFT.MATCH : DRIFT.MISMATCH;

  logShadowLine({
    kind: driftType,
    channel: "outbox",
    eventType: event.type,
    outboxKind: item.kind,
    clientEventId: event.clientEventId,
    legacyExecutionResult: legacyResult,
    ufecExecutionResult: ufecResult,
    executionDifference: !match ? { legacyResult, ufecResult } : undefined,
    driftStage: !match ? "classification" : null,
    stages,
    detailSummary: {
      outcome: detail?.outcome,
      code: detail?.code || null,
    },
  });

  if (!match) {
    logShadowLine({
      kind: DRIFT.EXECUTION_DIFFERENCE,
      channel: "outbox",
      clientEventId: event.clientEventId,
      outboxKind: item.kind,
      legacyExecutionResult: legacyResult,
      ufecExecutionResult: ufecResult,
    });
  }
}
