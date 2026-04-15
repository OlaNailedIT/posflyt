/**
 * HTTP adapter for POST /transactions and /transactions/return. Delegates to LEGACY_ADAPTER_ONLY
 * services (transactionService, returnService). UFEC client layer owns decision semantics.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

const { z } = require("zod");
const prisma = require("../config/prisma");
const {
  createTransactionsBulk,
  createReturnTransaction,
  listTransactions,
  findTransactionForBusinessById,
  settleTransactionCredit,
  mapTransactionPaymentFields,
} = require("../services/transactionService");
const { streamReceiptPdfForTransaction } = require("../services/receiptService");
const { assertTransactionQuota } = require("../services/usageQuotaService");
const { sendOk, sendError } = require("../utils/http");
const { logger } = require("../utils/logger");

const paymentLineSchema = z
  .object({
    type: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE"]),
    amount: z.coerce.number().positive(),
  })
  .strict();

const transactionSchema = z
  .object({
    client_transaction_id: z.string().uuid(),
    customer_id: z.string().uuid().optional(),
    branch: z.string().trim().min(1).max(120).optional(),
    total: z.coerce.number().nonnegative().optional(),
    /** Omit when sending `payments` (Phase 7.10.4 split tender). */
    payment_method: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE", "CREDIT", "MULTI"]).optional(),
    /** Split payment lines; amounts must sum to server-computed sale total. */
    payments: z.array(paymentLineSchema).min(1).optional(),
    /** paid | partial | credit — default paid when omitted */
    payment_status: z.enum(["paid", "partial", "credit"]).optional(),
    amount_paid: z.coerce.number().nonnegative().optional(),
    due_date: z.string().datetime().optional().nullable(),
    /** Offline sync dedupe (optional). */
    event_id: z.string().uuid().optional(),
    /** Phase 7.11.2: metrics / observability (optional). */
    checkout_source: z.enum(["standard", "quick"]).optional(),
    client_duration_ms: z.coerce.number().nonnegative().optional(),
    /** SHA-256 hex of canonical body (excluding this field); enforced on duplicate id. */
    payload_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    created_at: z.string().datetime(),
    items: z
      .array(
        z
          .object({
            product_id: z.string().uuid(),
            quantity: z.coerce.number().positive(),
          })
          .strict()
      )
      .min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasPayments = Array.isArray(data.payments) && data.payments.length > 0;
    if (!hasPayments && data.payment_method == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payment_method or payments is required",
        path: ["payment_method"],
      });
    }
    const ps = data.payment_status || "paid";
    if (hasPayments && ps !== "paid") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payment_status must be paid when using split payments",
        path: ["payments"],
      });
    }
    if (ps === "partial" && data.amount_paid == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount_paid is required when payment_status is partial",
        path: ["amount_paid"],
      });
    }
    if ((ps === "partial" || ps === "credit") && !data.customer_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customer_id is required for partial or credit sales",
        path: ["customer_id"],
      });
    }
  });

const bulkSchema = z
  .object({
    transactions: z.array(transactionSchema).min(1),
  })
  .strict();

/** ADR 003: attach contract fields without dropping legacy `status`, `receipt`, etc. */
function augmentSyncResult(result, clientTransactionId) {
  const transactionId =
    result.transactionId ?? result.transaction?.id ?? undefined;
  const withTx = result.transaction
    ? { ...result, transaction: mapTransactionPaymentFields(result.transaction) }
    : result;
  if (withTx.status === "duplicate") {
    return {
      ...withTx,
      transactionId,
      clientTransactionId,
      syncStatus: "duplicate",
    };
  }
  if (withTx.status === "created") {
    return {
      ...withTx,
      transactionId,
      clientTransactionId,
      syncStatus: "applied",
    };
  }
  if (withTx.status === "failed") {
    return {
      ...withTx,
      transactionId,
      clientTransactionId,
      syncStatus: "failed",
    };
  }
  return withTx;
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
      validated.transactions,
      { requestId: req.requestId }
    );

    const augmented = validated.transactions.map((tx, i) =>
      augmentSyncResult(results[i], tx.client_transaction_id)
    );

    augmented.forEach((r, i) => {
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
        const src = validated.transactions[i];
        if (src?.checkout_source === "quick") {
          logger.info(
            {
              event: "QUICK_SALES_CHECKOUT_COMPLETED",
              quickSalesMode: true,
              requestId: req.requestId,
              transactionId: tid,
              businessId,
              clientDurationMs: src.client_duration_ms ?? null,
            },
            "quick sales checkout completed"
          );
        }
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
    });

    const failed = augmented.filter((r) => r.status === "failed").length;
    const statusCode = failed ? 207 : 201;

    const data = {
      contractVersion: 2,
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
      if (only.transaction && (only.status === "created" || only.status === "duplicate")) {
        data.transaction = only.transaction;
        data.paymentStatus = only.transaction.paymentStatus;
        data.balanceDue = only.transaction.balanceDue;
      }
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

const returnBodySchema = z
  .object({
    client_return_id: z.string().uuid().optional(),
    client_transaction_id: z.string().uuid().optional(),
    original_transaction_id: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            product_id: z.string().min(1),
            quantity: z.coerce.number().positive(),
          })
          .strict()
      )
      .optional(),
  })
  .strict()
  .refine((d) => Boolean(d.client_return_id || d.client_transaction_id), {
    message: "client_return_id or client_transaction_id is required",
    path: ["client_return_id"],
  });

async function postTransactionReturn(req, res, next) {
  try {
    const body = returnBodySchema.parse(req.body);
    const result = await createReturnTransaction(req.auth.businessId, req.auth.userId, body, req.requestId);
    if (result.status === "duplicate") {
      return sendOk(res, {
        duplicate: true,
        transaction: mapTransactionPaymentFields(result.transaction),
        saleReturn: result.saleReturn || null,
      });
    }
    return sendOk(res, {
      transaction: mapTransactionPaymentFields(result.transaction),
      saleReturn: result.saleReturn || null,
    });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/transactionController.postTransactionReturn",
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

const clientTransactionIdParamSchema = z.string().uuid();

/** GET /transactions/:clientTransactionId — server truth for idempotency recovery (id === client_transaction_id). */
async function getTransactionByClientId(req, res, next) {
  try {
    const id = clientTransactionIdParamSchema.parse(req.params.clientTransactionId);
    const transaction = await findTransactionForBusinessById(req.auth.businessId, id);
    if (!transaction) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Transaction not found",
        location: "controllers/transactionController.getTransactionByClientId",
        details: { requestId: req.requestId },
      });
    }
    return sendOk(res, { contractVersion: 2, transaction });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Invalid transaction id",
        location: "controllers/transactionController.getTransactionByClientId",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

/** GET /transactions/:id/receipt — authenticated PDF download (Phase 7.12.1). */
async function getTransactionReceipt(req, res, next) {
  try {
    const row = await prisma.transaction.findFirst({
      where: { id: req.params.id, businessId: req.auth.businessId },
      select: { id: true, businessId: true, receiptId: true },
    });
    if (!row?.receiptId) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Receipt not available for this transaction",
        location: "controllers/transactionController.getTransactionReceipt",
      });
    }
    await streamReceiptPdfForTransaction(res, row);
  } catch (error) {
    return next(error);
  }
}

const settleTransactionBodySchema = z
  .object({
    amount: z.coerce.number().positive(),
    request_id: z.string().uuid().optional(),
    event_id: z.string().uuid().optional(),
  })
  .strict();

async function postSettleTransactionCredit(req, res, next) {
  try {
    const body = settleTransactionBodySchema.parse(req.body);
    const result = await settleTransactionCredit(
      req.auth.businessId,
      req.params.id,
      body.amount,
      req.auth.userId,
      body.request_id || null,
      body.event_id || null
    );
    const payload = result.transaction
      ? { ...result, transaction: mapTransactionPaymentFields(result.transaction) }
      : result;
    return sendOk(res, payload);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/transactionController.postSettleTransactionCredit",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = {
  postTransaction,
  postTransactionReturn,
  getTransactions,
  getTransactionByClientId,
  getTransactionReceipt,
  postSettleTransactionCredit,
};
