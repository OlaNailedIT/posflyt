/**
 * Phase 4D — global reconciliation (forensic verification of event stream vs projection).
 */
const { readLedgerSnapshot } = require("./ledgerSnapshotReader");
const {
  reconstructFromSortedEvents,
  rebuildFromDatabase,
  computeFingerprints,
} = require("./reconstructionEngine");
const { compareLedgerProjection } = require("./comparisonEngine");
const { classifyAnomalies, SEVERITY, severityScore } = require("./anomalyClassifier");
const { buildReconciliationReport } = require("./reconciliationReport");
const { runReconciliationScope } = require("./reconciliationService");
const { runScheduledReconciliationBatch } = require("./reconciliationScheduler");

module.exports = {
  readLedgerSnapshot,
  reconstructFromSortedEvents,
  rebuildFromDatabase,
  computeFingerprints,
  compareLedgerProjection,
  classifyAnomalies,
  SEVERITY,
  severityScore,
  buildReconciliationReport,
  runReconciliationScope,
  runScheduledReconciliationBatch,
};
