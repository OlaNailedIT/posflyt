/**
 * Phase 8.7 — failover / read-only guard for the authoritative region (ingest + future writers).
 */
const { deploymentRegionId } = require("../config/env");

/**
 * Optional JSON map: { "eu-west-1": false } marks a region as not accepting writes (failover / drain).
 * @returns {Record<string, boolean> | null}
 */
function loadRegionWritableMap() {
  const raw = process.env.REGION_WRITABLE_MAP_JSON;
  if (!raw || typeof raw !== "string") return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [String(k).trim(), Boolean(v)])
    );
  } catch {
    return null;
  }
}

let _mapCache = null;
function regionWritableMap() {
  if (!_mapCache) _mapCache = loadRegionWritableMap();
  return _mapCache;
}

/**
 * Whether financial writes for the tenant's home region may proceed (ops-controlled + local read-only).
 * @param {string} regionId — usually `regionForBusiness(businessId)`
 */
function isRegionWritable(regionId) {
  const rid = String(regionId || "").trim();
  if (!rid) return false;
  if (process.env.GLOBAL_WRITE_KILL_SWITCH === "true") return false;

  const map = regionWritableMap();
  if (map && Object.prototype.hasOwnProperty.call(map, rid)) {
    return map[rid];
  }

  if (rid === deploymentRegionId) {
    return process.env.DEPLOYMENT_REGION_READ_ONLY !== "true";
  }

  /** Peers: default writable if unset (prefer availability; combine with STRICT_REGION_INGEST in prod). */
  return process.env.REGION_PEER_DEFAULT_WRITABLE !== "false";
}

module.exports = {
  isRegionWritable,
  regionWritableMap,
};
