/**
 * Daily Profit Engine (DPE) — aggregates revenue (net subtotals), COGS, gross line profit, expenses, net profit.
 * Line economics are snapshot at sale time on TransactionItem; RETURN rows contribute negative rollups.
 */
const prisma = require("../config/prisma");
const { roundCurrency } = require("../utils/paymentState");
const { AppError } = require("../utils/AppError");

function assertExpenseConsistency(totalExpenses) {
  const t = roundCurrency(Number(totalExpenses));
  if (t < 0) {
    throw new AppError("INVALID_EXPENSE_STATE", "Aggregated expenses cannot be negative", 500);
  }
  return t;
}

function expenseWhereInRange(businessId, from, to) {
  return {
    businessId,
    OR: [
      { expenseDate: { gte: from, lte: to } },
      { AND: [{ expenseDate: null }, { createdAt: { gte: from, lte: to } }] },
    ],
  };
}

/**
 * Net subtotal revenue: SALE subtotals minus RETURN subtotals (pre-tax). Falls back when subtotalAmount null.
 */
function subtotalForRow(t) {
  const sub = t.subtotalAmount;
  if (sub != null && Number.isFinite(Number(sub))) return Number(sub);
  return roundCurrency(Number(t.totalAmount) - Number(t.taxAmount || 0));
}

/**
 * @returns {Promise<{ revenue: number, cogs: number, grossProfit: number, totalExpenses: number, netProfit: number }>}
 */
function sumItemsLineCost(items) {
  if (!items?.length) return 0;
  return items.reduce((s, i) => s + Number(i.lineCost || 0), 0);
}

function sumItemsLineProfit(items) {
  if (!items?.length) return 0;
  return items.reduce((s, i) => s + Number(i.lineProfit || 0), 0);
}

/**
 * COGS / gross profit from line items (works even when Prisma client DB is behind `Transaction.totalCogs` columns).
 */
function cogsAndGrossFromLines(t) {
  if (t.items?.length) {
    return {
      cogs: sumItemsLineCost(t.items),
      gross: sumItemsLineProfit(t.items),
    };
  }
  return { cogs: 0, gross: 0 };
}

async function aggregateDailyProfit(businessId, from, to) {
  const [saleRows, returnRows, expenseAgg] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessId, createdAt: { gte: from, lte: to }, transactionType: "SALE" },
      select: {
        subtotalAmount: true,
        totalAmount: true,
        taxAmount: true,
        items: { select: { lineCost: true, lineProfit: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { businessId, createdAt: { gte: from, lte: to }, transactionType: "RETURN" },
      select: {
        subtotalAmount: true,
        totalAmount: true,
        taxAmount: true,
        items: { select: { lineCost: true, lineProfit: true } },
      },
    }),
    prisma.expense.aggregate({
      where: expenseWhereInRange(businessId, from, to),
      _sum: { amount: true },
    }),
  ]);

  let revenue = 0;
  for (const t of saleRows) {
    revenue = roundCurrency(revenue + subtotalForRow(t));
  }
  for (const t of returnRows) {
    revenue = roundCurrency(revenue - subtotalForRow(t));
  }

  let cogs = 0;
  let grossProfit = 0;
  for (const t of saleRows) {
    const { cogs: c, gross: g } = cogsAndGrossFromLines(t);
    cogs = roundCurrency(cogs + c);
    grossProfit = roundCurrency(grossProfit + g);
  }
  for (const t of returnRows) {
    const { cogs: c, gross: g } = cogsAndGrossFromLines(t);
    cogs = roundCurrency(cogs + c);
    grossProfit = roundCurrency(grossProfit + g);
  }

  const rawExpenseSum = Number(expenseAgg._sum.amount || 0);
  const totalExpenses = assertExpenseConsistency(rawExpenseSum);
  const netProfit = roundCurrency(grossProfit - totalExpenses);

  return {
    revenue,
    cogs,
    grossProfit,
    totalExpenses,
    netProfit,
  };
}

module.exports = {
  aggregateDailyProfit,
  expenseWhereInRange,
};
