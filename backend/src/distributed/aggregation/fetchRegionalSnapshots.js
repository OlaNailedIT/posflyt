/**
 * Phase 8.2 — cross-region snapshot aggregation façade.
 * Peers without a local replica return zeroed placeholders; home region carries authoritative DB totals.
 */
const prisma = require("../../config/prisma");
const { deploymentRegionId } = require("../../config/env");
const { regionForBusiness } = require("../../sharding/shardResolver");
const { computeGlobalBalance } = require("../globalSnapshot/globalSnapshotMerge");
const { aggregateRegionalReports } = require("../reconciliation/globalReconciliationEngine");
const { buildSnapshotLineage } = require("../snapshotLineage");
const { getRegionClient } = require("../regionClient/regionClient");
const { getRegionHealth } = require("../health/regionHealth");

/**
 * Regions participating in aggregation (deployment + optional map + KNOWN_REGION_IDS).
 * @returns {string[]}
 */
function listAggregationRegionIds() {
  const ids = new Set();
  ids.add(deploymentRegionId);
  const raw = process.env.BUSINESS_REGION_MAP_JSON;
  if (raw && typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === "object" && !Array.isArray(o)) {
        for (const v of Object.values(o)) {
          if (typeof v === "string" && v.trim()) ids.add(v.trim());
        }
      }
    } catch {
      /* ignore */
    }
  }
  const known = process.env.KNOWN_REGION_IDS || "";
  for (const part of known.split(",")) {
    const s = part.trim();
    if (s) ids.add(s);
  }
  return [...ids];
}

/**
 * @param {string} businessId
 */
async function fetchRegionalSnapshots(businessId) {
  const home = regionForBusiness(businessId);
  const regionIds = [...new Set([...listAggregationRegionIds(), home])];

  const homeHealth = await getRegionHealth(home);
  const homeQueryable =
    homeHealth.status === "healthy" ||
    homeHealth.status === "degraded" ||
    homeHealth.status === "unknown";

  let balanceHome = 0;
  let snapAgg = { _count: { id: 0 }, _sum: { balance: 0 } };
  let newest = null;

  if (homeQueryable) {
    const rcHome = getRegionClient(home);
    snapAgg = await rcHome.prisma.integritySnapshot.aggregate({
      where: { businessId },
      _sum: { balance: true },
      _count: { id: true },
    });
    balanceHome = Number(snapAgg._sum.balance ?? 0);
    newest = await rcHome.prisma.integritySnapshot.findFirst({
      where: { businessId },
      orderBy: [{ eventCount: "desc" }, { updatedAt: "desc" }],
      select: { eventCount: true, lastEventId: true },
    });
  }

  const lineage = buildSnapshotLineage(newest, home);
  const incomplete = homeHealth.status === "down";

  /** @type {Record<string, object>} */
  const regions = {};
  const regionalSlices = [];

  for (const rid of regionIds) {
    const h = rid === home ? homeHealth : await getRegionHealth(rid);
    if (rid === home) {
      const sumForGlobal = homeHealth.status === "down" ? 0 : balanceHome;
      regions[rid] = {
        balance: balanceHome,
        integritySnapshotCount: snapAgg._count.id,
        reconciliationStatus: homeHealth.status === "down" ? "DEGRADED" : "PASS",
        source: "local_db",
        lineage,
        health: h,
      };
      regionalSlices.push({ regionId: rid, balanceSum: sumForGlobal });
    } else {
      regions[rid] = {
        balance: 0,
        integritySnapshotCount: 0,
        reconciliationStatus: "NO_LOCAL_REPLICA",
        source: "remote_peer_not_connected",
        lineage: buildSnapshotLineage(null, rid),
        health: h,
      };
      regionalSlices.push({ regionId: rid, balanceSum: 0 });
    }
  }

  const global = computeGlobalBalance(regionalSlices);

  /** One authoritative regional signal until peer APIs are wired; peers are structural placeholders. */
  const reconciliationPreview = aggregateRegionalReports(businessId, [
    { regionId: home, status: homeHealth.status === "down" ? "DEGRADED" : "PASS", anomalies: [] },
  ]);

  return {
    businessId,
    homeRegion: home,
    regions,
    global,
    aggregation: {
      strategy: "exclude_down_region_balance",
      incomplete,
      homeIncludedInSum: homeHealth.status !== "down",
      excludedFromSumWhenDown: incomplete ? [home] : [],
    },
    reconciliationPreview,
  };
}

/**
 * Phase 8.5 — drift when Σ(regional façade) ≠ primary DB aggregate (sanity / split-brain guard).
 * @param {string} businessId
 */
async function getCrossRegionDriftInfo(businessId) {
  const bundle = await fetchRegionalSnapshots(businessId);
  const direct = await prisma.integritySnapshot.aggregate({
    where: { businessId },
    _sum: { balance: true },
  });
  const directSum = Number(direct._sum.balance ?? 0);
  const regionalSum = bundle.global.globalBalance;
  const drift = Math.abs(regionalSum - directSum) > 1e-4;
  return {
    drift,
    directSum,
    regionalSum,
    businessId,
  };
}

module.exports = {
  listAggregationRegionIds,
  fetchRegionalSnapshots,
  getCrossRegionDriftInfo,
};
