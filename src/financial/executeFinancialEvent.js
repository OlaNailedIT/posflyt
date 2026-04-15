/**
 * Phase 2 — UFEC execution router (checkout + returns). **Single entry** for all client financial execution.
 * Phase 2 Step 6 — only this module may call postTransaction/postTransactionReturn (api.js guard + [UFEC_VIOLATION]).
 * Phase 2 Step 7 — UFEC dominance: classification + enforcement + ledger expectation are authoritative here.
 * Phase 3 Step 1 — Global Idempotency Boundary: global_event_id === clientEventId; see ufecIdempotencyRegistry.js
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

import {
  postTransaction,
  postTransactionReturn,
  ufecFinancialApiEnter,
  ufecFinancialApiExit,
} from "../services/api";
import {
  ENFORCEMENT_ACTION,
  preflightUfecCriticalBlock,
  UfecEnforcementError,
} from "./ufecEnforcement.js";
import { attachCanonicalOrderToFinancialEvent } from "./ufecCanonicalOrder.js";
import { emitExecutionObservationPhase, UFEC_OBSERVATION_PHASE } from "./ufecIfets.js";
import { applyLedgerConvergenceAfterExecution } from "./applyLedgerConvergencePersistence.js";
import { applyUfecPostExecutionEnforcement } from "./ufecLedgerShadow.js";
import { FINANCIAL_EVENT_TYPE } from "./ufecSyncShadow.js";
import { handleUfecExecutionFailure } from "./ufecExecutionFailure.js";
import {
  coalesceInflightExecution,
  completeUfecExecution,
  gatesBeforeExecution,
  getCompletedCachedResult,
  getGlobalEventId,
  markExecutionInFlight,
} from "./ufecIdempotencyRegistry.js";

function shouldLogUfecReturnRouter() {
  if (import.meta.env.VITE_UFEC_RETURN_ROUTER_DEBUG === "1") return true;
  if (import.meta.env.VITE_UFEC_RETURN_ROUTER_DEBUG === "0") return false;
  return import.meta.env.DEV;
}

function shouldLogUfecSaleRouter() {
  if (import.meta.env.VITE_UFEC_SALE_ROUTER_DEBUG === "1") return true;
  if (import.meta.env.VITE_UFEC_SALE_ROUTER_DEBUG === "0") return false;
  return import.meta.env.DEV;
}

/**
 * SALE_EVENT — global_event_id === clientEventId === payload.client_transaction_id (idempotency key).
 *
 * @param {object} opts
 * @param {string} [opts.clientEventId] — defaults to payload.client_transaction_id
 * @param {object} opts.payload — exact body passed to POST /transactions
 */
export function createSaleFinancialEvent({ clientEventId, payload }) {
  const id = clientEventId ?? payload?.client_transaction_id;
  if (!id) {
    throw new Error("createSaleFinancialEvent: missing client_transaction_id on payload");
  }
  if (payload?.client_transaction_id && String(id) !== String(payload.client_transaction_id)) {
    throw new Error("createSaleFinancialEvent: clientEventId must equal payload.client_transaction_id");
  }
  return {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: id,
    global_event_id: id,
    source: "checkout",
    payload,
  };
}

/**
 * @param {ReturnType<typeof createSaleFinancialEvent>} event
 */
export function saleEventToLegacyApiBody(event) {
  if (event.type !== FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    throw new Error("saleEventToLegacyApiBody: expected SALE_EVENT");
  }
  return { ...event.payload };
}

/**
 * @param {object} opts
 * @param {string} opts.clientEventId — canonical UFEC id (maps to client_return_id for API)
 * @param {string} opts.original_transaction_id
 * @param {{ product_id: string, quantity: number }[]|undefined} [opts.items]
 */
export function createReturnFinancialEvent({ clientEventId, original_transaction_id, items }) {
  return {
    type: FINANCIAL_EVENT_TYPE.RETURN_EVENT,
    clientEventId,
    global_event_id: clientEventId,
    source: "returns_ui",
    payload: {
      original_transaction_id,
      items,
    },
  };
}

/**
 * Legacy API body for POST /transactions/return (unchanged contract).
 *
 * @param {ReturnType<typeof createReturnFinancialEvent>} event
 */
export function returnEventToLegacyApiBody(event) {
  if (event.type !== FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    throw new Error("returnEventToLegacyApiBody: expected RETURN_EVENT");
  }
  const id = event.clientEventId;
  const { original_transaction_id, items } = event.payload;
  const body = {
    client_return_id: id,
    client_transaction_id: id,
    original_transaction_id,
  };
  if (items?.length) {
    body.items = items;
  }
  return body;
}

/**
 * HTTP + enforcement only (no idempotency / preflight).
 * @returns {Promise<{ result: unknown, ledgerBundle: ReturnType<typeof applyUfecPostExecutionEnforcement> }>}
 */
async function dispatchLegacyFinancialApi(event, deps) {
  const postTx = deps.postTransaction || postTransaction;
  const postReturn = deps.postTransactionReturn || postTransactionReturn;

  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    const body = saleEventToLegacyApiBody(event);
    if (shouldLogUfecSaleRouter()) {
      console.info("[UFEC_SALE_ROUTER]", {
        phase: "route",
        clientEventId: event.clientEventId,
      });
    }
    ufecFinancialApiEnter();
    try {
      const result = await postTx(body);
      const ledgerBundle = applyUfecPostExecutionEnforcement(event, result);
      return { result, ledgerBundle };
    } finally {
      ufecFinancialApiExit();
    }
  }

  if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    const body = returnEventToLegacyApiBody(event);
    if (shouldLogUfecReturnRouter()) {
      console.info("[UFEC_RETURN_ROUTER]", {
        phase: "route",
        clientEventId: event.clientEventId,
        originalTransactionId: event.payload?.original_transaction_id,
      });
    }
    ufecFinancialApiEnter();
    try {
      const result = await postReturn(body);
      const ledgerBundle = applyUfecPostExecutionEnforcement(event, result);
      return { result, ledgerBundle };
    } finally {
      ufecFinancialApiExit();
    }
  }

  throw new Error(`executeFinancialEvent: unsupported event type ${event.type}`);
}

/**
 * UFEC router: dispatches FinancialEvent to legacy handlers.
 *
 * @param {object} event — must include type, clientEventId (global_event_id)
 * @param {{ postTransaction?: typeof postTransaction, postTransactionReturn?: typeof postTransactionReturn, skipIdempotency?: boolean, bypassBackoff?: boolean }} [deps] — inject for tests
 */
export async function executeFinancialEvent(event, deps = {}) {
  if (deps.skipIdempotency === true) {
    const pre = preflightUfecCriticalBlock(event);
    if (pre.blocked) {
      throw new UfecEnforcementError(pre.reason, {
        level: 3,
        action: ENFORCEMENT_ACTION.BLOCK,
        phase: "preflight",
      });
    }
    const out = await dispatchLegacyFinancialApi(event, deps);
    return out.result;
  }

  const gid = getGlobalEventId(event);
  const cached = await getCompletedCachedResult(gid);
  if (cached !== null) {
    return cached;
  }

  return coalesceInflightExecution(gid, async () => {
    attachCanonicalOrderToFinancialEvent(event, event.type);
    await gatesBeforeExecution(gid, { bypassBackoff: deps.bypassBackoff === true });
    const pre = preflightUfecCriticalBlock(event);
    if (pre.blocked) {
      throw new UfecEnforcementError(pre.reason, {
        level: 3,
        action: ENFORCEMENT_ACTION.BLOCK,
        phase: "preflight",
      });
    }
    await markExecutionInFlight(gid, event.type);
    emitExecutionObservationPhase(gid, UFEC_OBSERVATION_PHASE.PRE_HTTP, { type: "EXECUTION_PRE_HTTP" });
    try {
      const out = await dispatchLegacyFinancialApi(event, deps);
      await applyLedgerConvergenceAfterExecution(gid, event, out.result, out.ledgerBundle);
      emitExecutionObservationPhase(gid, UFEC_OBSERVATION_PHASE.POST_HTTP_SUCCESS, {
        type: "EXECUTION_POST_HTTP_SUCCESS",
      });
      return out.result;
    } catch (e) {
      emitExecutionObservationPhase(gid, UFEC_OBSERVATION_PHASE.POST_HTTP_FAILURE, {
        type: "EXECUTION_POST_HTTP_FAILURE",
        meta: { message: e?.message, code: e?.code, syncCode: e?.syncCode },
      });
      await handleUfecExecutionFailure(event, e);
      throw e;
    }
  });
}
