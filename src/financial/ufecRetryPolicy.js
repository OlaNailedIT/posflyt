/**
 * Phase 3 Step 2 — Exponential backoff + jitter (identity-neutral).
 */

export const MAX_UFEC_RETRIES = 10;
const BASE_MS = 1000;
const CAP_MS = 60_000;
const JITTER_RATIO = 0.15;

/**
 * @param {number} retryCount — 1-based attempt after first failure
 * @returns {number}
 */
export function computeBackoffMs(retryCount) {
  const n = Math.max(1, Math.min(MAX_UFEC_RETRIES, Number(retryCount) || 1));
  const raw = Math.min(CAP_MS, BASE_MS * Math.pow(2, n - 1));
  return Math.floor(raw);
}

/**
 * @param {number} baseMs
 * @returns {number}
 */
export function applyJitterMs(baseMs) {
  const j = baseMs * JITTER_RATIO;
  return Math.floor(baseMs + (Math.random() * 2 - 1) * j);
}
