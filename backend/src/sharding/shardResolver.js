/**
 * Phase 8 — deterministic tenant → shard assignment. Single-DB deployments use shard 0 only when SHARD_COUNT=1.
 */
const crypto = require("crypto");
const { ledgerShardCount, deploymentRegionId } = require("../config/env");

/**
 * Optional JSON map on env: { "business-uuid": "eu-west-1" }
 * @returns {Record<string, string>}
 */
function loadBusinessRegionOverrides() {
  const raw = process.env.BUSINESS_REGION_MAP_JSON;
  if (!raw || typeof raw !== "string") return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

let _overrideCache = null;
function businessRegionOverrides() {
  if (!_overrideCache) _overrideCache = loadBusinessRegionOverrides();
  return _overrideCache;
}

/**
 * @param {string} businessId
 * @param {number} [shardCount]
 * @returns {number} 0 .. shardCount-1
 */
function shardIndexForBusiness(businessId, shardCount = ledgerShardCount) {
  const n = Math.max(1, Math.floor(shardCount));
  const h = crypto.createHash("sha256").update(String(businessId), "utf8").digest();
  const v = h.readUInt32BE(0);
  return Math.abs(v) % n;
}

/**
 * @param {string} businessId
 * @returns {string} region id for routing (defaults to deployment region).
 */
function regionForBusiness(businessId) {
  const o = businessRegionOverrides()[String(businessId)];
  if (o && typeof o === "string" && o.trim()) return o.trim();
  return deploymentRegionId;
}

/**
 * @param {string} businessId
 * @returns {{
 *   businessId: string,
 *   shardIndex: number,
 *   shardId: string,
 *   regionId: string,
 *   partitionKey: string,
 *   strategy: 'HASH_MOD_N',
 * }}
 */
function resolveShard(businessId) {
  const idx = shardIndexForBusiness(businessId);
  const regionId = regionForBusiness(businessId);
  return {
    businessId: String(businessId),
    shardIndex: idx,
    shardId: `shard-${idx}`,
    regionId,
    partitionKey: `biz:${businessId}|r:${regionId}|s:${idx}`,
    strategy: "HASH_MOD_N",
  };
}

module.exports = {
  shardIndexForBusiness,
  regionForBusiness,
  resolveShard,
};
