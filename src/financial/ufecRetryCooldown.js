/**
 * Phase 3 Step 2 — Global retry storm protection (in-memory sliding window).
 */

const WINDOW_MS = 60_000;
const SOFT_THRESHOLD = 24;
const HARD_THRESHOLD = 40;

let windowStart = Date.now();
let attemptsInWindow = 0;

function rollWindow() {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    attemptsInWindow = 0;
  }
}

export function recordUfecRetryAttempt() {
  rollWindow();
  attemptsInWindow += 1;
}

/**
 * @returns {{ throttle: boolean, extraDelayMs: number, suggestedConcurrency: number }}
 */
export function getUfecRetryThrottleState() {
  rollWindow();
  if (attemptsInWindow <= SOFT_THRESHOLD) {
    return { throttle: false, extraDelayMs: 0, suggestedConcurrency: 3 };
  }
  if (attemptsInWindow <= HARD_THRESHOLD) {
    return { throttle: true, extraDelayMs: 2_000, suggestedConcurrency: 2 };
  }
  return { throttle: true, extraDelayMs: 5_000, suggestedConcurrency: 1 };
}

export function resetUfecRetryCooldownForTests() {
  windowStart = Date.now();
  attemptsInWindow = 0;
}
