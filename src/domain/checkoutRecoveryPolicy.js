/** After this age (ms) in manual verification, show escape hatch to clear session and start fresh. */
export const MANUAL_VERIFY_ESCAPE_MS = 5 * 60 * 1000;

/** First delay before background GET while in manual verification; grows exponentially (capped). */
export const BACKGROUND_RECONCILE_BASE_MS = 30 * 1000;

/** Cap for spacing between background GET attempts (avoids unbounded waits). */
export const BACKGROUND_RECONCILE_MAX_DELAY_MS = 120 * 1000;

/** Max extra GET attempts after initial backoff (bounded eventual convergence). */
export const BACKGROUND_RECONCILE_MAX_ATTEMPTS = 5;

/**
 * Delay before background reconcile attempt `attemptIndex` (1-based).
 * @param {number} attemptIndex
 */
export function backgroundReconcileDelayMs(attemptIndex) {
  const i = Math.max(1, attemptIndex);
  const raw = BACKGROUND_RECONCILE_BASE_MS * 2 ** (i - 1);
  return Math.min(raw, BACKGROUND_RECONCILE_MAX_DELAY_MS);
}
