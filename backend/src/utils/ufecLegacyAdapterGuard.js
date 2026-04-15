/**
 * Phase 2 Step 7 — Optional reminder that legacy services are LEGACY_ADAPTER_ONLY execution zones.
 * Does nothing unless UFEC_LEGACY_ADAPTER_ZONE_LOG=1 and NODE_ENV !== production.
 */

const { logger } = require("./logger");

/**
 * @param {string} moduleName — e.g. "transactionService"
 */
function logLegacyAdapterZone(moduleName) {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.UFEC_LEGACY_ADAPTER_ZONE_LOG !== "1") return;
  logger.info(
    { zone: "LEGACY_ADAPTER_ONLY", module: moduleName },
    "UFEC legacy adapter zone marker (see docs/UFEC_PHASE2_DOMINANCE.md)"
  );
}

module.exports = { logLegacyAdapterZone };
