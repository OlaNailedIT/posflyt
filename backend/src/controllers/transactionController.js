const { z } = require("zod");
const { createTransactionsBulk, listTransactions } = require("../services/transactionService");
const { assertTransactionQuota } = require("../services/usageQuotaService");
const { sendOk, sendError } = require("../utils/http");
const { logger } = require("../utils/logger");

const transactionSchema = z.object({
  client_transaction_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  branch: z.string().trim().min(1).max(120).optional(),
  total: z.coerce.number().nonnegative().optional(),
  payment_method: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE"]),
  created_at: z.string().datetime(),
  items: z
    .array(
      z
        .object({
          product_id: z.string().uuid(),
          quantity: z.coerce.number().int().positive(),
        })
        .strict()
    )
    .min(1),
}).strict();

const bulkSchema = z
  .object({
    transactions: z.array(transactionSchema).min(1),
  })
  .strict();

/** ADR 003: attach contract fields without dropping legacy `status`, `receipt`, etc. */
function augmentSyncResult(result, clientTransactionId) {
  const transactionId =
    result.transactionId ?? result.transaction?.id ?? undefined;
  if (result.status === "duplicate") {
    return {
      ...result,
      transactionId,
      clientTransactionId,
      syncStatus: "duplicate",
    };
  }
  if (result.status === "created") {
    return {
      ...result,
      transactionId,
      clientTransactionId,
      syncStatus: "applied",
    };
  }
  if (result.status === "failed") {
    return {
      ...result,
      transactionId,
      clientTransactionId,
      syncStatus: "failed",
    };
  }
  return result;
}

async function postTransaction(req, res, next) {
  try {
    if (req.timedout) return;

    if (Array.isArray(req.body?.transactions) && req.body.transactions.length > 50) {
      return sendError(res, {
        statusCode: 400,
        code: "BATCH_TOO_LARGE",
        message: "Maximum 50 transactions per request",
        location: "controllers/transactionController.postTransaction",
        details: { requestId: req.requestId },
      });
    }
    if (Array.isArray(req.body) && req.body.length > 50) {
      return sendError(res, {
        statusCode: 400,
        code: "BATCH_TOO_LARGE",
        message: "Maximum 50 transactions per request",
        location: "controllers/transactionController.postTransaction",
        details: { requestId: req.requestId },
      });
    }

    const payload = Array.isArray(req.body)
      ? { transactions: req.body }
      : req.body.transactions
        ? req.body
        : { transactions: [req.body] };

    const validated = bulkSchema.parse(payload);
    const businessId = req.auth.businessId;

    await assertTransactionQuota(businessId, validated.transactions.length, {
      userId: req.auth.userId,
    });

    for (const tx of validated.transactions) {
      logger.info(
        {
          event: "SYNC_ATTEMPT",
          requestId: req.requestId,
          clientTransactionId: tx.client_transaction_id,
          businessId,
        },
        "sync attempt"
      );
    }

    const results = await createTransactionsBulk(
      businessId,
      req.auth.userId,
      validated.transactions
    );

    const augmented = validated.transactions.map((tx, i) =>
      augmentSyncResult(results[i], tx.client_transaction_id)
    );

    for (const r of augmented) {
      if (r.status === "duplicate") {
        logger.warn(
          {
            event: "SYNC_DUPLICATE",
            requestId: req.requestId,
            clientTransactionId: r.clientTransactionId,
            businessId,
          },
          "sync duplicate"
        );
      } else if (r.status === "created") {
        const tid = r.transaction?.id ?? r.transactionId;
        logger.info(
          {
            event: "SYNC_SUCCESS",
            requestId: req.requestId,
            transactionId: tid,
            businessId,
          },
          "sync success"
        );
      } else if (r.status === "failed") {
        logger.error(
          {
            event: "SYNC_ERROR",
            requestId: req.requestId,
            businessId,
            error: r.message || "Unknown",
            clientTransactionId: r.clientTransactionId,
          },
          "sync error"
        );
      }
    }

    const failed = augmented.filter((r) => r.status === "failed").length;
    const statusCode = failed ? 207 : 201;

    const data = {
      synced: augmented.filter((r) => r.status === "created").length,
      duplicates: augmented.filter((r) => r.status === "duplicate").length,
      failed,
      results: augmented,
    };

    if (validated.transactions.length === 1) {
      const only = augmented[0];
      data.transactionId = only.transactionId;
      data.clientTransactionId = only.clientTransactionId;
      data.syncStatus = only.syncStatus;
    }

    return sendOk(res, data, statusCode);
  } catch (error) {
    if (error.name === "ZodError") {
      const clientTransactionId =
        typeof req.body?.client_transaction_id === "string"
          ? req.body.client_transaction_id
          : undefined;
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/transactionController.postTransaction",
        details: { requestId: req.requestId, errors: error.issues },
        data: clientTransactionId ? { clientTransactionId } : undefined,
      });
    }
    return next(error);
  }
}

async function getTransactions(req, res, next) {
  try {
    const data = await listTransactions(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = { postTransaction, getTransactions };
