const { logger } = require("./logger");

/**
 * Phase 9: simple circuit breaker for outbound HTTP / flaky deps (Slack, payment APIs).
 */
function createCircuitBreaker(name, { failureThreshold = 5, resetMs = 30_000, halfOpenAfterMs = 10_000 } = {}) {
  let failures = 0;
  let openedAt = 0;
  let state = "closed";

  function allow() {
    if (state === "open") {
      if (Date.now() - openedAt > halfOpenAfterMs) {
        state = "half_open";
        return true;
      }
      return false;
    }
    return true;
  }

  function recordSuccess() {
    failures = 0;
    state = "closed";
  }

  function recordFailure() {
    failures += 1;
    if (failures >= failureThreshold) {
      state = "open";
      openedAt = Date.now();
      logger.warn({ name, failures }, "circuit breaker opened");
      setTimeout(() => {
        state = "half_open";
      }, resetMs);
    }
  }

  return { name, allow, recordSuccess, recordFailure, getState: () => state };
}

module.exports = { createCircuitBreaker };
