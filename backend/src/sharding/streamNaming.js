/**
 * Phase 8.6 — Kafka-style topic names aligned with shard + region (logical; mirrors router).
 */
const { resolveShard } = require("./shardResolver");

/**
 * @param {string} businessId
 * @returns {string} e.g. vessa.eu-west-1.shard-2.events
 */
function streamTopicForBusiness(businessId) {
  const s = resolveShard(businessId);
  return `vessa.${s.regionId}.${s.shardId}.events`;
}

module.exports = {
  streamTopicForBusiness,
};
