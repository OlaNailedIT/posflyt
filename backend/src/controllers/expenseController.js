const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { AppError } = require("../utils/AppError");
const {
  createExpense,
  getExpenses,
  getDailySummary,
} = require("../services/expenseService");
const { DEFAULT_EXPENSE_CATEGORIES } = require("../config/expenseCategories");
const { logger } = require("../utils/logger");

const createSchema = z
  .object({
    amount: z.coerce.number(),
    category: z.string().min(1),
    note: z.string().optional(),
    expense_date: z.string().min(8).max(16).optional(),
    request_id: z.string().min(1).optional(),
    event_id: z.string().min(1).optional(),
  })
  .strict();

const queryRangeSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

function parseQueryDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function assertRangePair(req) {
  const hasFrom = req.query.from != null && String(req.query.from).trim() !== "";
  const hasTo = req.query.to != null && String(req.query.to).trim() !== "";
  if (hasFrom !== hasTo) {
    const err = new Error("Both from and to are required together");
    err.code = "INVALID_RANGE";
    err.statusCode = 400;
    throw err;
  }
}

async function postExpense(req, res, next) {
  try {
    const payload = createSchema.parse(req.body);
    const result = await createExpense({
      businessId: req.auth.businessId,
      amount: payload.amount,
      category: payload.category,
      note: payload.note,
      expense_date: payload.expense_date,
      request_id: payload.request_id,
      event_id: payload.event_id,
    });

    if (result.reason === "request") {
      return sendOk(res, { expense: result.expense }, 200, { code: "DUPLICATE_REQUEST" });
    }
    if (result.reason === "event") {
      return sendOk(res, { expense: result.expense }, 200, { code: "SYNC_DUPLICATE_EVENT" });
    }
    return sendOk(res, { expense: result.expense }, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/expenseController.postExpense",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    if (error instanceof AppError) {
      return sendError(res, {
        statusCode: error.statusCode || 400,
        code: error.code,
        message: error.message,
        location: "controllers/expenseController.postExpense",
        details: { requestId: req.requestId },
      });
    }
    return next(error);
  }
}

async function listExpenses(req, res, next) {
  try {
    queryRangeSchema.parse(req.query);
    assertRangePair(req);
    const from = parseQueryDate(req.query.from);
    const to = parseQueryDate(req.query.to);
    if (req.query.from && !from) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_RANGE",
        message: "Invalid from date",
        location: "controllers/expenseController.listExpenses",
        details: { requestId: req.requestId },
      });
    }
    if (req.query.to && !to) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_RANGE",
        message: "Invalid to date",
        location: "controllers/expenseController.listExpenses",
        details: { requestId: req.requestId },
      });
    }
    const data = await getExpenses({
      businessId: req.auth.businessId,
      from,
      to,
    });
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/expenseController.listExpenses",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    if (error.code === "INVALID_RANGE") {
      return sendError(res, {
        statusCode: 400,
        code: error.code,
        message: error.message,
        location: "controllers/expenseController.listExpenses",
        details: { requestId: req.requestId },
      });
    }
    return next(error);
  }
}

async function getDailySummaryHandler(req, res, next) {
  try {
    queryRangeSchema.parse(req.query);
    assertRangePair(req);
    const from = parseQueryDate(req.query.from);
    const to = parseQueryDate(req.query.to);
    if (req.query.from && !from) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_RANGE",
        message: "Invalid from date",
        location: "controllers/expenseController.getDailySummaryHandler",
        details: { requestId: req.requestId },
      });
    }
    if (req.query.to && !to) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_RANGE",
        message: "Invalid to date",
        location: "controllers/expenseController.getDailySummaryHandler",
        details: { requestId: req.requestId },
      });
    }
    const data = await getDailySummary(req.auth.businessId, from, to);
    logger.info(
      {
        event: "DAILY_PROFIT_SUMMARY_VIEWED",
        businessId: req.auth.businessId,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        date: data.date,
        totalSales: data.totalSales,
        totalExpenses: data.totalExpenses,
        dailyProfit: data.dailyProfit,
      },
      "DAILY_PROFIT_SUMMARY_VIEWED"
    );
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/expenseController.getDailySummaryHandler",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    if (error.code === "INVALID_RANGE") {
      return sendError(res, {
        statusCode: 400,
        code: error.code,
        message: error.message,
        location: "controllers/expenseController.getDailySummaryHandler",
        details: { requestId: req.requestId },
      });
    }
    return next(error);
  }
}

async function getExpenseMeta(req, res, next) {
  try {
    return sendOk(res, {
      suggestedCategories: DEFAULT_EXPENSE_CATEGORIES,
      calendar: {
        defaultTimeZone: "UTC",
        note:
          "Daily summaries and dashboard “today” use UTC day bounds until a business time zone is configured on Settings.",
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  postExpense,
  listExpenses,
  getDailySummaryHandler,
  getExpenseMeta,
};
