const { z } = require("zod");
const { createTransactionsBulk, listTransactions } = require("../services/transactionService");
const { sendOk, sendError } = require("../utils/http");

const transactionSchema = z.object({
  client_transaction_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  branch: z.string().trim().min(1).max(120).optional(),
  total: z.coerce.number().nonnegative().optional(),
  payment_method: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE"]),
  created_at: z.string().datetime(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
}).strict();

const bulkSchema = z.object({
  transactions: z.array(transactionSchema).min(1),
});

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
    const payload = Array.isArray(req.body)
      ? { transactions: req.body }
      : req.body.transactions
        ? req.body
        : { transactions: [req.body] };

    const validated = bulkSchema.parse(payload);
    const results = await createTransactionsBulk(
      req.auth.businessId,
      req.auth.userId,
      validated.transactions
    );

    const augmented = validated.transactions.map((tx, i) =>
      augmentSyncResult(results[i], tx.client_transaction_id)
    );

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
        ...(clientTransactionId
          ? { data: { clientTransactionId } }
          : {}),
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
