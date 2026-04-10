const prisma = require("../config/prisma");
const { roundCurrency } = require("../utils/paymentState");
const { getBusinessDayRange } = require("../utils/businessDayRange");
const { ensureBusinessSettings } = require("./settingsService");

/**
 * Phase 7.12.4: aggregate sales for the business’s local calendar day (IANA zone on Settings).
 * Top item = highest total quantity sold (same rule as daily profit summary).
 */
async function getOwnerDailySummary(businessId) {
  const settings = await ensureBusinessSettings(businessId);
  const tzRaw = settings.businessTimeZone != null ? String(settings.businessTimeZone).trim() : "";
  const tz = tzRaw || "UTC";
  const { from, to, dateKey, timeZone, timeZoneFallback, requestedTimeZone } = getBusinessDayRange(
    new Date(),
    tz
  );

  const [salesAgg, txCount, topItems] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, createdAt: { gte: from, lte: to } },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.count({
      where: { businessId, createdAt: { gte: from, lte: to } },
    }),
    prisma.transactionItem.groupBy({
      by: ["productId"],
      where: {
        transaction: {
          businessId,
          createdAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true },
    }),
  ]);

  const totalSales = roundCurrency(Number(salesAgg._sum.totalAmount || 0));

  let topItemName = "None";
  if (topItems.length) {
    topItems.sort((a, b) => Number(b._sum.quantity || 0) - Number(a._sum.quantity || 0));
    const top = topItems[0];
    const product = await prisma.product.findFirst({
      where: { id: top.productId, businessId },
      select: { name: true },
    });
    topItemName = product?.name || "None";
  }

  return {
    totalSales,
    transactions: txCount,
    topItemName,
    currencySymbol: settings.currencySymbol || "$",
    dateKey,
    calendar: {
      timeZone,
      timeZoneFallback: Boolean(timeZoneFallback),
      requestedTimeZone: requestedTimeZone || null,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  };
}

module.exports = { getOwnerDailySummary };
