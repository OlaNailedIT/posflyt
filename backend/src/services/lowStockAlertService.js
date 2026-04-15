const { nowISOString } = require("../utils/date.js");
const prisma = require("../config/prisma");
const { nodeEnv } = require("../config/env");
const { logger } = require("../utils/logger");
const { isLowStockCondition } = require("../utils/lowStock");
const { isFeatureEnabled } = require("./featureFlagService");
const { ensureBusinessSubscription } = require("./subscriptionService");

let schedulerStarted = false;

function utcDayString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Record at most one LOW_STOCK_ALERT_TRIGGERED log per product per UTC day (dedupe table).
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function recordLowStockAlertIfNeeded(tx, { businessId, plan, product, newStock, source }) {
  if (!product?.id) return;
  const threshold = product.lowStockThreshold;
  if (!isLowStockCondition(newStock, threshold)) return;

  const allowed = await isFeatureEnabled(businessId, plan, "LOW_STOCK_ALERTS");
  if (!allowed) return;

  const dayUtc = utcDayString();
  const stock = Number(newStock);
  const thr = Number(threshold);

  try {
    await tx.lowStockAlertDay.create({
      data: {
        businessId,
        productId: product.id,
        dayUtc,
        stock,
        threshold: thr,
        source,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") return;
    throw e;
  }

  logger.info(
    {
      event: "LOW_STOCK_ALERT_TRIGGERED",
      lowStockAlert: true,
      businessId,
      productId: product.id,
      productName: product.name || null,
      currentStock: stock,
      threshold: thr,
      source,
      dayUtc,
      timestamp: nowISOString(),
    },
    "low stock threshold reached"
  );
}

/**
 * Hourly reconciliation: catches manual stock edits and drift.
 */
async function runLowStockScanForBusiness(businessId) {
  const sub = await ensureBusinessSubscription(businessId);
  const allowed = await isFeatureEnabled(businessId, sub.plan, "LOW_STOCK_ALERTS");
  if (!allowed) return;

  const rows = await prisma.$queryRaw`
    SELECT p."id" AS "id", p."name" AS "name", p."stock" AS "stock", p."lowStockThreshold" AS "lt"
    FROM "Product" p
    WHERE p."businessId" = ${businessId}
      AND p."lowStockThreshold" IS NOT NULL
      AND p."lowStockThreshold" > 0
      AND p."stock" <= p."lowStockThreshold"
  `;

  for (const row of rows) {
    try {
      await recordLowStockAlertIfNeeded(prisma, {
        businessId,
        plan: sub.plan,
        product: {
          id: row.id,
          name: row.name,
          lowStockThreshold: row.lt,
        },
        newStock: Number(row.stock),
        source: "scheduled_scan",
      });
    } catch (err) {
      logger.warn({ err: err.message, businessId, productId: row.id }, "low stock scan record failed");
    }
  }
}

async function runLowStockScanAllBusinesses() {
  if (nodeEnv === "test") return;
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const b of businesses) {
    try {
      await runLowStockScanForBusiness(b.id);
    } catch (err) {
      logger.warn({ err: err.message, businessId: b.id }, "low stock scheduled scan failed for business");
    }
  }
}

function startLowStockAlertScheduler() {
  if (schedulerStarted || nodeEnv === "test") return;
  schedulerStarted = true;
  const hourMs = 60 * 60 * 1000;
  setInterval(() => {
    runLowStockScanAllBusinesses().catch((e) => {
      logger.error({ err: e.message }, "low stock scan interval failed");
    });
  }, hourMs);
  logger.info({ intervalMs: hourMs }, "Low stock alert scheduler active");
}

module.exports = {
  recordLowStockAlertIfNeeded,
  runLowStockScanForBusiness,
  runLowStockScanAllBusinesses,
  startLowStockAlertScheduler,
  utcDayString,
};
