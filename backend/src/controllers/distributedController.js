/**
 * Phase 8 — read-only tenant routing + derived “global” stats (single DB today).
 */
const { sendOk } = require("../utils/http");
const prisma = require("../config/prisma");
const { ledgerShardCount, deploymentRegionId } = require("../config/env");
const { resolveShard, regionForBusiness } = require("../sharding/shardResolver");
const { describeRoute } = require("../sharding/router");
const { getRegionalContext, describeProcessingPipeline } = require("../regions/regionalEventProcessor");
const { computeGlobalBalance } = require("../distributed/globalSnapshot/globalSnapshotMerge");
const { fetchRegionalSnapshots } = require("../distributed/aggregation/fetchRegionalSnapshots");
const { getLocalRegionHealth } = require("../distributed/health/regionHealth");

async function getShardMetadata(req, res, next) {
  try {
    const businessId = req.auth.businessId;
    const shard = resolveShard(businessId);
    const route = describeRoute(businessId);
    return sendOk(res, {
      deploymentRegionId,
      ledgerShardCount,
      shard,
      route,
      model: "single_primary_db",
      note: "Multi-region failover queues are not wired yet; routing keys are stable for future broker topics.",
    });
  } catch (e) {
    return next(e);
  }
}

async function getRegionalPipeline(req, res, next) {
  try {
    return sendOk(res, {
      region: getRegionalContext(),
      pipeline: describeProcessingPipeline(),
    });
  } catch (e) {
    return next(e);
  }
}

async function getTenantDerivedGlobal(req, res, next) {
  try {
    const businessId = req.auth.businessId;
    const shard = resolveShard(businessId);
    const agg = await prisma.integritySnapshot.aggregate({
      where: { businessId },
      _sum: { balance: true },
      _count: { id: true },
    });
    const balanceSum = Number(agg._sum.balance ?? 0);
    const regionalBundle = await fetchRegionalSnapshots(businessId);
    const derived = computeGlobalBalance([{ regionId: regionForBusiness(businessId), balanceSum }]);
    return sendOk(res, {
      businessId,
      shard,
      integritySnapshots: {
        count: agg._count.id,
        sumBalance: balanceSum,
      },
      derivedGlobal: derived,
      regionalAggregation: regionalBundle,
      globalReconciliationPreview: regionalBundle.reconciliationPreview,
    });
  } catch (e) {
    return next(e);
  }
}

async function getRegionalAggregate(req, res, next) {
  try {
    const businessId = req.auth.businessId;
    const bundle = await fetchRegionalSnapshots(businessId);
    return sendOk(res, bundle);
  } catch (e) {
    return next(e);
  }
}

async function getLocalRegionHealthEndpoint(req, res, next) {
  try {
    const health = await getLocalRegionHealth();
    return sendOk(res, { deploymentRegionId, health });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  getShardMetadata,
  getRegionalPipeline,
  getTenantDerivedGlobal,
  getRegionalAggregate,
  getLocalRegionHealthEndpoint,
};
