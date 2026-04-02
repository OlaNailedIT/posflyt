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

    const failed = results.filter((r) => r.status === "failed").length;
    const statusCode = failed ? 207 : 201;
    return sendOk(
      res,
      {
      synced: results.filter((r) => r.status === "created").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      failed,
      results,
      },
      statusCode
    );
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/transactionController.postTransaction",
        details: { requestId: req.requestId, errors: error.issues },
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
