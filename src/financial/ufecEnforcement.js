/**
 * Phase 2 — UFEC enforcement (graduated: WARN / FLAG / BLOCK). **Primary authority** for client-side
 * financial decisions (levels 0–3, RECONCILE_REQUIRED). Backend validation is complementary
 * (integrity); do not duplicate enforcement semantics in legacy services.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

import { FINANCIAL_EVENT_TYPE } from "./ufecSyncShadow.js";

export const ENFORCEMENT_LEVEL = {
  /** Match — no drift */
  L0: 0,
  /** Minor drift (e.g. small rounding) */
  L1: 1,
  /** Financial drift — flag, do not block */
  L2: 2,
  /** Critical — may block */
  L3: 3,
};

export const ENFORCEMENT_ACTION = {
  ALLOW: "ALLOW",
  WARN: "WARN",
  FLAG: "FLAG",
  BLOCK: "BLOCK",
};

/** @typedef {{ level: number, action: keyof typeof ENFORCEMENT_ACTION, reason: string, comparison?: object }} UfecEnforcementDecision */

/**
 * @param {number} level
 * @returns {keyof typeof ENFORCEMENT_ACTION}
 */
export function actionForLevel(level) {
  if (level <= ENFORCEMENT_LEVEL.L0) return ENFORCEMENT_ACTION.ALLOW;
  if (level === ENFORCEMENT_LEVEL.L1) return ENFORCEMENT_ACTION.WARN;
  if (level === ENFORCEMENT_LEVEL.L2) return ENFORCEMENT_ACTION.FLAG;
  return ENFORCEMENT_ACTION.BLOCK;
}

/**
 * Central decision from comparison + event context.
 * @param {object} event
 * @param {{ enforcementLevel?: number, status?: string, details?: object }} comparison
 * @returns {UfecEnforcementDecision}
 */
export function evaluateUfecEnforcement(event, comparison) {
  const level = Number(comparison?.enforcementLevel ?? ENFORCEMENT_LEVEL.L0);
  const action = actionForLevel(level);
  const reason =
    comparison?.details?.reason ||
    comparison?.status ||
    "ok";
  return {
    level,
    action,
    reason: String(reason),
    event,
    comparison,
  };
}

/**
 * Block before network when integrity cannot be satisfied.
 * @param {object} event — FinancialEvent
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function preflightUfecCriticalBlock(event) {
  if (event.type === FINANCIAL_EVENT_TYPE.RETURN_EVENT) {
    const oid = event.payload?.original_transaction_id;
    if (oid == null || String(oid).trim() === "") {
      return {
        blocked: true,
        reason: "RETURN_EVENT requires original_transaction_id",
      };
    }
  }

  if (event.type === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    const p = event.payload || {};
    if (!p.client_transaction_id) {
      return { blocked: true, reason: "SALE_EVENT requires client_transaction_id" };
    }
    const t = p.total;
    if (t != null && t !== "" && Number.isFinite(Number(t)) && Number(t) < -0.0001) {
      return { blocked: true, reason: "SALE_EVENT total must not be negative" };
    }
  }

  return { blocked: false };
}

export class UfecEnforcementError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, level?: number, action?: string, phase?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "UfecEnforcementError";
    this.code = meta.code || "RECONCILE_REQUIRED";
    this.isUfecEnforcement = true;
    this.ufecLevel = meta.level ?? ENFORCEMENT_LEVEL.L3;
    this.ufecAction = meta.action || ENFORCEMENT_ACTION.BLOCK;
    this.ufecPhase = meta.phase || "unknown";
  }
}
