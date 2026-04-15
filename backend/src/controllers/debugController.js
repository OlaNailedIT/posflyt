const prisma = require("../config/prisma");
const { sendOk, sendError } = require("../utils/http");
const { debugTransaction } = require("../services/transactionService");
const { listExpensesForDebug } = require("../services/expenseService");

async function getSyncDiagnostics(req, res, next) {
  try {
    const businessId = req.auth?.businessId;
    if (!businessId) {
      return sendError(res, {
        statusCode: 400,
        code: "MISSING_BUSINESS",
        message: "Business context required",
        location: "controllers/debugController.getSyncDiagnostics",
      });
    }

    const totalTransactions = await prisma.transaction.count({
      where: { businessId },
    });

    const recentTransactions = await prisma.transaction.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
        syncStatus: true,
        paymentMethod: true,
        payments: true,
      },
    });

    return sendOk(res, {
      totalTransactions,
      recentTransactions,
    });
  } catch (err) {
    return next(err);
  }
}

async function getTransactionDebug(req, res, next) {
  try {
    const businessId = req.auth?.businessId;
    if (!businessId) {
      return sendError(res, {
        statusCode: 400,
        code: "MISSING_BUSINESS",
        message: "Business context required",
        location: "controllers/debugController.getTransactionDebug",
      });
    }
    const data = await debugTransaction(businessId, req.params.id);
    if (!data) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Transaction not found",
        location: "controllers/debugController.getTransactionDebug",
        details: { requestId: req.requestId },
      });
    }
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getExpensesDebug(req, res, next) {
  try {
    const businessId = req.auth?.businessId;
    if (!businessId) {
      return sendError(res, {
        statusCode: 400,
        code: "MISSING_BUSINESS",
        message: "Business context required",
        location: "controllers/debugController.getExpensesDebug",
      });
    }
    const date = typeof req.query.date === "string" ? req.query.date : "";
    const data = await listExpensesForDebug(businessId, date);
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSyncDiagnostics, getTransactionDebug, getExpensesDebug };
