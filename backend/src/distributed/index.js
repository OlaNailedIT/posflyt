/**
 * Phase 8 — public façade for sharding + global aggregation helpers.
 */
const { resolveShard, shardIndexForBusiness } = require("../sharding/shardResolver");
const { describeRoute } = require("../sharding/router");
const { aggregateRegionalReports } = require("./reconciliation/globalReconciliationEngine");
const { computeGlobalBalance, mergeSnapshotFootprints } = require("./globalSnapshot/globalSnapshotMerge");
const { assertRegionLocalSnapshot, mergeOrderingKey } = require("./snapshotCoherence/snapshotCoordinator");

module.exports = {
  resolveShard,
  shardIndexForBusiness,
  describeRoute,
  aggregateRegionalReports,
  computeGlobalBalance,
  mergeSnapshotFootprints,
  assertRegionLocalSnapshot,
  mergeOrderingKey,
};
