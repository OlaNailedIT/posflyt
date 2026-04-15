/**
 * Phase 8 — regional processing contract. Wires conceptually to Phases 4B–4D + 5 on **this** node.
 * Cross-region: duplicate this stack per region; events never double-apply thanks to shard ownership.
 */
const { deploymentRegionId } = require("../config/env");

/**
 * Metadata for logs / streaming (single-region default).
 */
function getRegionalContext() {
  return {
    regionId: deploymentRegionId,
    processor: "regionalEventProcessor",
    selfSufficient: true,
  };
}

/**
 * Ordered pipeline labels for observability (no side effects).
 */
function describeProcessingPipeline() {
  return [
    { phase: "4B", step: "INTEGRITY_INGEST", description: "Append-only integrity events" },
    { phase: "4C", step: "LEDGER_PROJECTION", description: "Deterministic derived lines" },
    { phase: "5", step: "SNAPSHOT", description: "Region-local checkpoint" },
    { phase: "4D", step: "RECONCILIATION", description: "Forensic compare + PASS/FAIL" },
  ];
}

module.exports = {
  getRegionalContext,
  describeProcessingPipeline,
};
