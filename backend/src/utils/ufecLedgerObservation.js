/**
 * Phase 2 — UFEC ledger observation (shadow). Structured server logs only; no behavior change.
 */

const { logger } = require("./logger");

/**
 * @param {Record<string, unknown>} payload
 */
function logUfecLedgerObservation(payload) {
  logger.info(
    {
      component: "UFEC_LEDGER",
      ...payload,
    },
    "[UFEC_LEDGER]"
  );
}

module.exports = { logUfecLedgerObservation };
