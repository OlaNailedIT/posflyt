const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { roundCurrency } = require("../utils/paymentState");
const { AppError } = require("../utils/AppError");
const { startOfUtcDay, endOfUtcDay, getBusinessDayRange } = require("../utils/businessDayRange");
const { aggregateDailyProfit, expenseWhereInRange } = require("./dailyProfitService");

function parseIsoDateDay(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
}

function normalizeRange(fromInput, toInput) {
  let from = fromInput;
  let to = toInput;
  if (!from && !to) {
    const r = getBusinessDayRange(new Date(), "UTC");
    from = r.from;
    to = r.to;
  } else if (from && to) {
    from = startOfUtcDay(from);
    to = endOfUtcDay(to);
  } else {
    const err = new Error("Both from and to are required");
    err.code = "INVALID_RANGE";
    err.statusCode = 400;
    throw err;
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    const err = new Error("Invalid date range");
    err.code = "INVALID_RANGE";
    err.statusCode = 400;
    throw err;
  }
  return { from, to };
}

/**
 * Same pattern as payment state guards: aggregated expense totals must never be negative.
 */
function assertExpenseConsistency(totalExpenses) {
  const t = roundCurrency(Number(totalExpenses));
  if (t < 0) {
    throw new AppError(
      "INVALID_EXPENSE_STATE",
      "Aggregated expenses cannot be negative",
      500
    );
  }
  return t;
}

function inferExpenseSource(row) {
  if (!row) return "api";
  if (row.eventId) return "sync";
  return "api";
}

function serializeExpense(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.businessId,
    amount: roundCurrency(Number(row.amount)),
    category: row.category,
    note: row.note,
    expenseDate: row.expenseDate ? row.expenseDate.toISOString() : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requestId: row.requestId,
    eventId: row.eventId,
    source: inferExpenseSource(row),
  };
}

function normalizeExpenseCategory(category) {
  if (category == null) {
    throw new AppError("INVALID_EXPENSE_CATEGORY", "Category is required");
  }
  const trimmed = String(category).trim();
  if (trimmed === "") {
    throw new AppError("INVALID_EXPENSE_CATEGORY", "Category is required");
  }
  return trimmed.toLowerCase();
}

/**
 * @returns {Promise<{ expense: object, reason: 'created' | 'request' | 'event' }>}
 */
function resolveExpenseCalendarDay(raw) {
  if (raw == null || raw === "") return null;
  const d = parseIsoDateDay(String(raw).trim());
  if (!d) {
    throw new AppError("INVALID_EXPENSE_DATE", "expense_date must be YYYY-MM-DD", 400);
  }
  return startOfUtcDay(d);
}

async function createExpense({
  businessId,
  amount,
  category,
  note,
  expense_date: expenseDateInput,
  request_id: requestId,
  event_id: eventId,
}) {
  const rounded = roundCurrency(Number(amount));
  if (!(rounded > 0)) {
    throw new AppError("INVALID_EXPENSE_AMOUNT", "Expense amount must be greater than zero");
  }
  const normalizedCategory = normalizeExpenseCategory(category);
  const noteTrimmed = note != null && String(note).trim() !== "" ? String(note).trim() : null;

  if (requestId) {
    const existing = await prisma.expense.findUnique({ where: { requestId } });
    if (existing) {
      if (String(existing.businessId) !== String(businessId)) {
        throw new AppError("DUPLICATE_REQUEST", "Idempotency key conflict", 409);
      }
      logger.warn(
        { event: "EXPENSE_DUPLICATE_REQUEST", businessId, requestId },
        "EXPENSE_DUPLICATE_REQUEST"
      );
      return { expense: serializeExpense(existing), reason: "request" };
    }
  }

  if (eventId) {
    const byEvent = await prisma.expense.findFirst({
      where: { businessId, eventId },
    });
    if (byEvent) {
      logger.warn({ event: "SYNC_DUPLICATE_EVENT", event_id: eventId, businessId }, "SYNC_DUPLICATE_EVENT");
      return { expense: serializeExpense(byEvent), reason: "event" };
    }
  }

  try {
    const expenseDay = resolveExpenseCalendarDay(expenseDateInput) ?? startOfUtcDay(new Date());
    const created = await prisma.expense.create({
      data: {
        businessId,
        amount: rounded,
        category: normalizedCategory,
        note: noteTrimmed,
        requestId: requestId || null,
        eventId: eventId || null,
        expenseDate: expenseDay,
      },
    });
    logger.info(
      {
        event: "EXPENSE_CREATED",
        businessId,
        requestId: requestId || null,
        eventId: eventId || null,
        amount: rounded,
        category: normalizedCategory,
      },
      "EXPENSE_CREATED"
    );
    if (eventId) {
      logger.info({ event: "EXPENSE_SYNCED", businessId, eventId }, "EXPENSE_SYNCED");
    }
    return { expense: serializeExpense(created), reason: "created" };
  } catch (e) {
    if (e?.code === "P2002" && requestId) {
      const existing = await prisma.expense.findUnique({ where: { requestId } });
      if (existing && String(existing.businessId) === String(businessId)) {
        logger.warn(
          { event: "EXPENSE_DUPLICATE_REQUEST", businessId, requestId },
          "EXPENSE_DUPLICATE_REQUEST"
        );
        return { expense: serializeExpense(existing), reason: "request" };
      }
    }
    if (e?.code === "P2002" && eventId) {
      const existing = await prisma.expense.findFirst({
        where: { businessId, eventId },
      });
      if (existing) {
        logger.warn({ event: "SYNC_DUPLICATE_EVENT", event_id: eventId, businessId }, "SYNC_DUPLICATE_EVENT");
        return { expense: serializeExpense(existing), reason: "event" };
      }
    }
    throw e;
  }
}

async function getExpenses({ businessId, from, to }) {
  const { from: f, to: t } = normalizeRange(from, to);
  const rows = await prisma.expense.findMany({
    where: expenseWhereInRange(businessId, f, t),
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map(serializeExpense);
}

async function getDailySummary(businessId, fromInput, toInput) {
  const { from, to } = normalizeRange(fromInput, toInput);

  const [dpe, txCount, topItems] = await Promise.all([
    aggregateDailyProfit(businessId, from, to),
    prisma.transaction.count({
      where: { businessId, createdAt: { gte: from, lte: to }, transactionType: "SALE" },
    }),
    prisma.transactionItem.groupBy({
      by: ["productId"],
      where: {
        transaction: {
          businessId,
          createdAt: { gte: from, lte: to },
          transactionType: "SALE",
        },
      },
      _sum: { quantity: true },
    }),
  ]);

  const totalSales = dpe.revenue;
  const totalExpenses = assertExpenseConsistency(dpe.totalExpenses);
  const grossProfit = dpe.grossProfit;
  const dailyProfit = dpe.netProfit;

  const dateFromKey = from.toISOString().slice(0, 10);
  const dateToKey = to.toISOString().slice(0, 10);
  /** Single UTC calendar day when range is one day (typical for “daily” summary). */
  const date = dateFromKey === dateToKey ? dateFromKey : null;

  let topProduct = null;
  if (topItems.length) {
    topItems.sort((a, b) => Number(b._sum.quantity || 0) - Number(a._sum.quantity || 0));
    const top = topItems[0];
    const product = await prisma.product.findFirst({
      where: { id: top.productId, businessId },
      select: { name: true },
    });
    topProduct = product?.name || null;
  }

  return {
    date,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    totalSales,
    revenue: totalSales,
    cogs: dpe.cogs,
    totalExpenses,
    dailyProfit,
    grossProfit,
    netProfit: dpe.netProfit,
    profit: dpe.netProfit,
    profitType: "net",
    transactions: txCount,
    topProduct,
    from: from.toISOString(),
    to: to.toISOString(),
    calendar: {
      timeZone: "UTC",
      note: "Bounds use UTC calendar days. Pass business time zone when Settings expose it.",
    },
  };
}

function serializeExpenseForDebug(row) {
  const base = serializeExpense(row);
  if (!base) return null;
  return {
    ...base,
    requestId: row.requestId ?? null,
    eventId: row.eventId ?? null,
    source: inferExpenseSource(row),
  };
}

async function listExpensesForDebug(businessId, dateIso) {
  const day = parseIsoDateDay(dateIso);
  if (!day) {
    const err = new Error("Invalid date (expected YYYY-MM-DD)");
    err.code = "VALIDATION_FAILED";
    err.statusCode = 400;
    throw err;
  }
  const anchor = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12, 0, 0, 0));
  const { from, to, dateKey, timeZone } = getBusinessDayRange(anchor, "UTC");

  const [rows, summary] = await Promise.all([
    prisma.expense.findMany({
      where: expenseWhereInRange(businessId, from, to),
      orderBy: { createdAt: "desc" },
    }),
    getDailySummary(businessId, from, to),
  ]);

  return {
    expenses: rows.map(serializeExpenseForDebug),
    totalExpenses: summary.totalExpenses,
    totalSales: summary.totalSales,
    dailyProfit: summary.dailyProfit,
    grossProfit: summary.grossProfit,
    profit: summary.profit,
    profitType: summary.profitType,
    date: summary.date ?? dateKey,
    dateKey,
    calendar: { timeZone, utcRange: { from: from.toISOString(), to: to.toISOString() } },
    profitDebug: {
      formula: "roundCurrency(totalSales - totalExpenses)",
      profitType: "gross",
      utcRange: { from: from.toISOString(), to: to.toISOString() },
      transactionCount: summary.transactions,
      topProduct: summary.topProduct,
      checklist:
        "Compare totalSales to sum of transaction.totalAmount for this UTC window; totalExpenses to Expense rows; gross profit must equal totalSales - totalExpenses after rounding.",
      sourceLegend:
        "Each row.source: api | sync. Replay deduplication reuses the same DB row (no separate replay flag).",
    },
  };
}

module.exports = {
  createExpense,
  getExpenses,
  getDailySummary,
  listExpensesForDebug,
  normalizeRange,
  serializeExpense,
  assertExpenseConsistency,
  startOfUtcDay,
  endOfUtcDay,
  getBusinessDayRange,
};
