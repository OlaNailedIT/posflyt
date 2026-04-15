/**
 * Phase 4D — placeholder for batch / periodic reconciliation (cron, queue).
 * Wire `runReconciliationScope` from `reconciliationService` when scheduling exists.
 */

/**
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function runScheduledReconciliationBatch() {
  return { ok: false, message: "batch reconciliation not wired (use API or jobs)" };
}

module.exports = {
  runScheduledReconciliationBatch,
};
