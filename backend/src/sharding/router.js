/**
 * Phase 8 — routing façade. Today all work stays on the local Prisma datasource; multi-region adds an outbox / broker hop here.
 */
const { resolveShard } = require("./shardResolver");
const { getRegionClient } = require("../distributed/regionClient/regionClient");

/**
 * @param {string} businessId
 */
function describeRoute(businessId) {
  const shard = resolveShard(businessId);
  const rc = getRegionClient(shard.regionId);
  const stream = `vessa.${shard.regionId}.${shard.shardId}.events`;
  return {
    ...shard,
    db: {
      regionId: rc.regionId,
      dataSource: rc.dataSource,
      hasDedicatedPool: rc.hasDedicatedPool,
    },
    stream,
    target: rc.dataSource === "primary" ? "primary_database" : "region_configured_pool",
    /** @deprecated use `stream` — kept for older clients */
    logicalEventStream: stream,
  };
}

module.exports = {
  describeRoute,
};
