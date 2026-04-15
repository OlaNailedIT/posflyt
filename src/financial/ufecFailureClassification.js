/**
 * Phase 3 Step 2 — Failure classification (not a boolean).
 */

import { isRecoverableNetworkError } from "../utils/networkError.js";
import { UfecEnforcementError } from "./ufecEnforcement.js";

export const FAILURE_CLASS = {
  /** Network / timeout / 5xx / 408 / 429 */
  RETRYABLE: "RETRYABLE",
  /** Validation, 4xx business, malformed payload, idempotency conflict */
  NON_RETRYABLE: "NON_RETRYABLE",
  /** Enforcement / ledger integrity — repair path */
  DEGRADED: "DEGRADED",
};

/**
 * Stable signature for repeated-failure escalation.
 * @param {unknown} error
 */
export function failureSignature(error) {
  if (!error || typeof error !== "object") return String(error);
  const e = /** @type {{ response?: { status?: number, data?: { code?: string } }, code?: string, message?: string }} */ (error);
  const http = e.response?.status;
  const apiCode = e.response?.data?.code;
  const code = apiCode || e.code || "";
  const msg = String(e.message || "").slice(0, 120);
  return [http ?? "", code, msg].join("|");
}

/**
 * @param {unknown} error
 * @returns {{ class: keyof typeof FAILURE_CLASS, reason: string }}
 */
export function classifyUfecFailure(error) {
  if (!error) {
    return { class: FAILURE_CLASS.NON_RETRYABLE, reason: "empty_error" };
  }

  if (error?.isUfecIdempotency === true) {
    if (error.code === "BACKOFF") {
      return { class: FAILURE_CLASS.NON_RETRYABLE, reason: "backoff_gate" };
    }
    return { class: FAILURE_CLASS.NON_RETRYABLE, reason: `idempotency_${error.code || "unknown"}` };
  }

  if (error instanceof UfecEnforcementError) {
    return { class: FAILURE_CLASS.DEGRADED, reason: "enforcement_block" };
  }

  if (isRecoverableNetworkError(error)) {
    return { class: FAILURE_CLASS.RETRYABLE, reason: "recoverable_network" };
  }

  const status = error.response?.status;
  if (typeof status === "number") {
    if (status === 408 || status === 429) {
      return { class: FAILURE_CLASS.RETRYABLE, reason: `http_${status}` };
    }
    if (status >= 500 && status < 600) {
      return { class: FAILURE_CLASS.RETRYABLE, reason: "http_5xx" };
    }
    if (status >= 400 && status < 500) {
      return { class: FAILURE_CLASS.NON_RETRYABLE, reason: `http_4xx_${status}` };
    }
  }

  return { class: FAILURE_CLASS.NON_RETRYABLE, reason: "unknown_non_retryable" };
}
