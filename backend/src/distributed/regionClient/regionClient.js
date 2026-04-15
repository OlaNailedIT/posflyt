/**
 * Phase 8.1 — region-scoped data access façade.
 * Today every region resolves to the process Prisma client; multi-region adds per-region pools via REGION_DATABASE_URLS_JSON (future).
 */
const prisma = require("../../config/prisma");
const { deploymentRegionId } = require("../../config/env");

/**
 * @returns {Record<string, string>}
 */
function loadRegionDatabaseUrls() {
  const raw = process.env.REGION_DATABASE_URLS_JSON;
  if (!raw || typeof raw !== "string") return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [String(k).trim(), typeof v === "string" ? v.trim() : ""])
    );
  } catch {
    return {};
  }
}

let _urlCache = null;
function regionDatabaseUrls() {
  if (!_urlCache) _urlCache = loadRegionDatabaseUrls();
  return _urlCache;
}

/**
 * @param {string} regionId
 * @returns {{
 *   regionId: string,
 *   prisma: import('@prisma/client').PrismaClient,
 *   dataSource: 'primary' | 'region_configured',
 *   hasDedicatedPool: boolean,
 * }}
 */
function getRegionClient(regionId) {
  const rid = String(regionId || "").trim() || deploymentRegionId;
  const urls = regionDatabaseUrls();
  const url = urls[rid];
  return {
    regionId: rid,
    prisma,
    dataSource: url ? "region_configured" : "primary",
    hasDedicatedPool: Boolean(url),
  };
}

module.exports = {
  getRegionClient,
  regionDatabaseUrls,
};
