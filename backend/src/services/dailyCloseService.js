const prisma = require("../config/prisma");
const { roundCurrency } = require("../utils/paymentState");
const { getBusinessDayRange } = require("../utils/businessDayRange");
const { ensureBusinessSettings } = require("./settingsService");
const { logger } = require("../utils/logger");

async function getDailyCloseStatus(businessId) {
  const settings = await ensureBusinessSettings(businessId);
  const tzRaw = settings.businessTimeZone != null ? String(settings.businessTimeZone).trim() : "";
  const tz = tzRaw || "UTC";
  const now = new Date();
  const { from: dayStart, to: dayEnd, dateKey, timeZone } = getBusinessDayRange(now, tz);
  const periodEnd = now;

  const [salesAgg, transactionsCount, inventoryConflicts, syncFailures, existingClose] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, createdAt: { gte: dayStart, lte: periodEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.count({
      where: { businessId, createdAt: { gte: dayStart, lte: periodEnd } },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_INVENTORY_CONFLICT",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_RETRY_FAILED",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.dailyClose.findUnique({
      where: { businessId_businessDayKey: { businessId, businessDayKey: dateKey } },
    }),
  ]);

  const totalRevenue = roundCurrency(Number(salesAgg._sum.totalAmount || 0));

  const varianceFlags = [];
  if (syncFailures > 0) varianceFlags.push("Unsynced sales detected");
  if (inventoryConflicts > 0) varianceFlags.push("Inventory conflicts detected");

  const closeSummary = existingClose
    ? {
        dailyCloseId: existingClose.id,
        totalSales: roundCurrency(Number(existingClose.totalSales)),
        businessDayKey: existingClose.businessDayKey,
        startOfDay: existingClose.startOfDay.toISOString(),
        endOfDay: existingClose.endOfDay.toISOString(),
      }
    : null;

  return {
    date: dateKey,
    businessDayKey: dateKey,
    totalRevenue,
    transactionCount: transactionsCount,
    varianceFlags,
    isClosed: Boolean(existingClose),
    closedAt: existingClose?.closedAt || null,
    closedByUserId: existingClose?.userId || null,
    closeSummary,
    calendar: { timeZone },
  };
}

/**
 * Records one DailyClose for the current business calendar day (idempotent).
 * Also writes DAILY_CLOSE_CONFIRMED audit log for existing observability.
 */
async function confirmDailyClose(businessId, userId) {
  const status = await getDailyCloseStatus(businessId);
  if (status.isClosed) {
    return status;
  }

  const settings = await ensureBusinessSettings(businessId);
  const tzRaw = settings.businessTimeZone != null ? String(settings.businessTimeZone).trim() : "";
  const tz = tzRaw || "UTC";
  const now = new Date();
  const { from: dayStart, dateKey } = getBusinessDayRange(now, tz);

  const totalSales = roundCurrency(Number(status.totalRevenue));

  let created;
  try {
    created = await prisma.dailyClose.create({
      data: {
        businessId,
        userId,
        totalSales,
        startOfDay: dayStart,
        endOfDay: now,
        closedAt: now,
        businessDayKey: dateKey,
      },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      logger.warn(
        { event: "DAILY_CLOSE_RACE_DEDUPED", businessId, businessDayKey: dateKey },
        "daily close duplicate ignored"
      );
      return getDailyCloseStatus(businessId);
    }
    throw err;
  }

  const metadata = {
    date: status.date,
    totalRevenue: status.totalRevenue,
    transactionCount: status.transactionCount,
    varianceFlags: status.varianceFlags,
    dailyCloseId: created.id,
    businessDayKey: dateKey,
  };

  await prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action: "DAILY_CLOSE_CONFIRMED",
      metadata,
    },
  });

  logger.info(
    {
      event: "DAILY_CLOSE_RECORDED",
      businessId,
      userId,
      dailyCloseId: created.id,
      businessDayKey: dateKey,
      totalSales,
    },
    "daily close persisted"
  );

  return getDailyCloseStatus(businessId);
}

module.exports = {
  getDailyCloseStatus,
  confirmDailyClose,
};
