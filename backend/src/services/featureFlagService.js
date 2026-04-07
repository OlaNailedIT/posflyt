const crypto = require("crypto");
const prisma = require("../config/prisma");
const { DEFAULT_FEATURE_FLAGS } = require("../config/planEntitlements");

const PLAN_TO_FIELD = {
  FREE: "freeEnabled",
  BASIC: "basicEnabled",
  PREMIUM: "premiumEnabled",
};

let cache = { at: 0, rows: null };
const CACHE_MS = 60_000;

function stableBucketPercent(businessId, key) {
  const h = crypto.createHash("sha256").update(`${businessId}:${key}`).digest();
  return h.readUInt16BE(0) % 100;
}

async function loadFlags() {
  const now = Date.now();
  if (cache.rows && now - cache.at < CACHE_MS) return cache.rows;
  const rows = await prisma.featureFlag.findMany();
  cache = { at: now, rows };
  return rows;
}

function resolveRow(key, rows) {
  const fromDb = rows.find((r) => r.key === key);
  if (fromDb) return fromDb;
  const d = DEFAULT_FEATURE_FLAGS[key];
  if (!d) return null;
  return {
    key,
    label: null,
    freeEnabled: d.FREE,
    basicEnabled: d.BASIC,
    premiumEnabled: d.PREMIUM,
    abRolloutPercent: d.abRolloutPercent,
  };
}

/**
 * Whether a feature is enabled for this business (tier + optional A/B bucket).
 */
function resolveEnabledForRow(businessId, plan, row) {
  if (!row) return false;
  const field = PLAN_TO_FIELD[plan] || "freeEnabled";
  const tierOk = Boolean(row[field]);
  if (!tierOk) return false;
  if (row.abRolloutPercent == null) return true;
  const p = Math.max(0, Math.min(100, row.abRolloutPercent));
  return stableBucketPercent(businessId, row.key) < p;
}

async function isFeatureEnabled(businessId, plan, featureKey) {
  const rows = await loadFlags();
  const row = resolveRow(featureKey, rows);
  if (!row) return false;
  return resolveEnabledForRow(businessId, plan, row);
}

/** All known flags with resolved booleans for the given plan + business. */
async function getResolvedFeatureMap(businessId, plan) {
  const rows = await loadFlags();
  const keys = new Set([
    ...rows.map((r) => r.key),
    ...Object.keys(DEFAULT_FEATURE_FLAGS),
  ]);
  const out = {};
  for (const key of keys) {
    const row = resolveRow(key, rows);
    out[key] = resolveEnabledForRow(businessId, plan, row ? { ...row, key } : null);
  }
  return out;
}

function invalidateFeatureFlagCache() {
  cache = { at: 0, rows: null };
}

module.exports = {
  isFeatureEnabled,
  getResolvedFeatureMap,
  invalidateFeatureFlagCache,
  stableBucketPercent,
};
