/**
 * @file LEGACY_ADAPTER_ONLY — Phase 2 Step 7
 *
 * Sale persistence, payment normalization, inventory decrement, and related effects are **execution
 * adapter** responsibilities. Client UFEC (FinancialEvent → executeFinancialEvent → enforcement →
 * ledger expectation) owns product-facing financial correctness. Do **not** add new business rules
 * here without extending UFEC first. Server validation remains for integrity, quotas, and abuse
 * prevention — not a parallel “decision system” vs UFEC.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const { markFirstSaleDone } = require("./onboardingService");
const { logAudit } = require("./auditService");
const { recordSyncRetryResolution } = require("./runtimeMetricsService");
const { isFeatureEnabled } = require("./featureFlagService");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { logger } = require("../utils/logger");
const prisma = require("../config/prisma");
const { toSafeISOString } = require("../utils/date.js");
const {
  computePaymentState,
  roundCurrency,
  paymentStatusToApi,
  assertConsistentPaymentState,
} = require("../utils/paymentState");
const { parseSplitPayments } = require("../utils/splitPayments");
const {
  validateTransactionInvariants,
  evaluateInvariantResult,
} = require("./financialInvariantService");
const { isMeasuredProduct, unitPriceForSale, assertSaleQuantity } = require("../utils/productUnits");
const { recordLowStockAlertIfNeeded } = require("./lowStockAlertService");
const { attachReceiptArtifactsIfEnabled } = require("./receiptService");

function safeHexEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== 64 || b.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
const { logUfecLedgerObservation } = require("../utils/ufecLedgerObservation");
const { logLegacyAdapterZone } = require("../utils/ufecLegacyAdapterGuard");

logLegacyAdapterZone("transactionService");

/** Normalize credit / partial payment fields. Server total is authoritative. */
function normalizeCreditFields(payload, totalAmount, location) {
  const split = parseSplitPayments(payload, totalAmount, location);
  if (split) {
    assertConsistentPaymentState(totalAmount, split.amountPaid, split.balanceDue);
    return {
      paymentStatus: split.paymentStatus,
      amountPaid: split.amountPaid,
      balanceDue: split.balanceDue,
      paymentMethod: split.paymentMethod,
      dueDate: null,
      splitPayments: split.payments,
      softDriftAdjusted: Boolean(split.softDriftAdjusted),
    };
  }

  if (payload.payment_method === "MULTI") {
    const error = new Error("MULTI payment_method requires a non-empty payments array");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    error.location = location;
    throw error;
  }

  const paymentStatusRaw = String(payload.payment_status || "paid").toLowerCase();
  if (!["paid", "partial", "credit"].includes(paymentStatusRaw)) {
    const error = new Error("Invalid payment_status");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    error.location = location;
    throw error;
  }

  let paidInput;
  if (paymentStatusRaw === "paid") {
    paidInput =
      payload.amount_paid != null && payload.amount_paid !== ""
        ? Number(payload.amount_paid)
        : totalAmount;
  } else if (paymentStatusRaw === "partial") {
    if (payload.amount_paid == null) {
      const error = new Error("amount_paid is required when payment_status is partial");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      error.location = location;
      throw error;
    }
    paidInput = Number(payload.amount_paid);
  } else {
    paidInput = 0;
  }

  if (payload.payment_method == null) {
    const error = new Error("payment_method is required when payments array is not used");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    error.location = location;
    throw error;
  }

  let paymentMethod = payload.payment_method;
  let state;
  try {
    state = computePaymentState(totalAmount, paidInput);
  } catch (e) {
    e.location = location;
    throw e;
  }

  if (paymentStatusRaw === "credit") {
    paymentMethod = "CREDIT";
  }

  assertConsistentPaymentState(totalAmount, state.amountPaid, state.balanceDue);

  let dueDate = null;
  if (payload.due_date) {
    const d = new Date(payload.due_date);
    if (Number.isNaN(d.getTime())) {
      const error = new Error("Invalid due_date");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      error.location = location;
      throw error;
    }
    dueDate = d;
  }

  return {
    paymentStatus: state.paymentStatus,
    amountPaid: state.amountPaid,
    balanceDue: state.balanceDue,
    paymentMethod,
    dueDate,
    splitPayments: undefined,
    softDriftAdjusted: false,
  };
}

function mapTransactionPaymentFields(row) {
  if (!row) return row;
  return {
    ...row,
    paymentStatus: paymentStatusToApi(row.paymentStatus),
    transactionType: row.transactionType || "SALE",
  };
}

/**
 * Sum balanceDue for open credit/partial sales (source of truth).
 */
async function getCustomerOutstanding(businessId, customerId) {
  const agg = await prisma.transaction.aggregate({
    where: {
      businessId,
      customerId,
      paymentStatus: { in: ["PARTIAL", "CREDIT"] },
    },
    _sum: { balanceDue: true },
  });
  return roundCurrency(Number(agg._sum.balanceDue || 0));
}

/**
 * Apply payment to one sale row (transaction-level settlement).
 */
async function settleTransactionCredit(
  businessId,
  transactionId,
  amount,
  userId,
  requestId,
  eventId
) {
  const rounded = roundCurrency(Number(amount));
  if (rounded <= 0) {
    const err = new Error("amount must be positive");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.transaction.findFirst({
        where: { id: transactionId, businessId },
      });
      if (!row) {
        const err = new Error("Transaction not found");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }

      if (eventId && row.lastProcessedEventId === eventId) {
        const hydrated = await tx.transaction.findUnique({
          where: { id: transactionId },
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true, totalOutstanding: true } },
          },
        });
        return { idempotent: true, transaction: hydrated };
      }

      if (requestId && row.lastSettlementRequestId === requestId) {
        const hydrated = await tx.transaction.findUnique({
          where: { id: transactionId },
          include: {
            customer: { select: { id: true, name: true, phone: true, email: true, totalOutstanding: true } },
          },
        });
        return { idempotent: true, transaction: hydrated };
      }

      if (row.balanceDue <= 0) {
        const err = new Error("Transaction is already fully paid");
        err.statusCode = 400;
        err.code = "ALREADY_SETTLED";
        throw err;
      }

      if (rounded > roundCurrency(row.balanceDue) + 0.0001) {
        logger.warn(
          {
            event: "OVERPAYMENT_ATTEMPT",
            businessId,
            transactionId,
            amount: rounded,
            balanceDue: row.balanceDue,
          },
          "settlement exceeds balance"
        );
        const err = new Error("amount exceeds outstanding balance");
        err.statusCode = 400;
        err.code = "EXCEEDS_OUTSTANDING";
        throw err;
      }

      const state = computePaymentState(row.totalAmount, row.amountPaid + rounded);
      assertConsistentPaymentState(row.totalAmount, state.amountPaid, state.balanceDue);

      if (row.customerId) {
        const dec = await tx.customer.updateMany({
          where: {
            id: row.customerId,
            businessId,
            totalOutstanding: { gte: rounded },
          },
          data: { totalOutstanding: { decrement: rounded } },
        });
        if (dec.count !== 1) {
          const err = new Error("Could not update customer balance");
          err.statusCode = 409;
          err.code = "SETTLEMENT_CONFLICT";
          throw err;
        }
      }

      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          amountPaid: roundCurrency(state.amountPaid),
          balanceDue: roundCurrency(state.balanceDue),
          paymentStatus: state.paymentStatus,
          lastSettlementRequestId: requestId || null,
          lastProcessedEventId: eventId != null ? eventId : row.lastProcessedEventId,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true, totalOutstanding: true } },
        },
      });

      await logAudit({
        businessId,
        userId,
        action: "CREDIT_SETTLED",
        metadata: {
          transactionId,
          customerId: row.customerId,
          amount: rounded,
          requestId: requestId || null,
        },
      });

      logger.info(
        {
          event: "PAYMENT_SETTLED",
          requestId,
          businessId,
          transactionId,
          customerId: row.customerId,
          amount: rounded,
          remainingBalance: roundCurrency(state.balanceDue),
          totalAmount: roundCurrency(row.totalAmount),
        },
        "payment settled on transaction"
      );

      return { idempotent: false, transaction: updated };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15_000,
      maxWait: 10_000,
    }
  );
}

async function resolveRetryMetricIfNeeded({ businessId, userId, transactionId, successAt }) {
  if (!transactionId) return;
  const failed = await prisma.auditLog.findFirst({
    where: {
      businessId,
      action: "SYNC_RETRY_FAILED",
      metadata: { path: ["transactionId"], equals: transactionId },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!failed) return;

  const failureTime = new Date(failed.createdAt).getTime();
  const successTime = new Date(successAt).getTime();
  const resolutionMs = successTime - failureTime;
  if (!Number.isFinite(resolutionMs) || resolutionMs < 0) return;

  recordSyncRetryResolution(resolutionMs);
  await logAudit({
    businessId,
    userId,
    action: "SYNC_RETRY_RESOLVED",
    metadata: {
      transactionId,
      firstFailureAt: failed.createdAt,
      successAt: toSafeISOString(successAt),
      resolutionMs,
    },
  });
}

async function processSingleTransaction(tx, businessId, userId, payload, options = {}) {
  const requestId = options.requestId || null;
  const plan = options.plan || "FREE";
  const location = "services/transactionService.processSingleTransaction";
  const { items, client_transaction_id, created_at, customer_id } = payload;

  if (!items?.length) {
    const error = new Error("At least one transaction item is required");
    error.statusCode = 400;
    error.location = location;
    throw error;
  }

  const transactionId = client_transaction_id;
  if (!transactionId) {
    const error = new Error("client_transaction_id is required");
    error.statusCode = 400;
    error.location = location;
    throw error;
  }

  /** Sync idempotency: same `client_transaction_id` + business replays; `payload_hash` gates conflicting bodies. */
  const existingForBusiness = await tx.transaction.findUnique({
    where: {
      id_businessId: {
        id: transactionId,
        businessId,
      },
    },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, barcode: true } } },
      },
    },
  });
  if (existingForBusiness) {
    const incomingHash = payload.payload_hash;
    if (incomingHash && !existingForBusiness.payloadHash) {
      logger.warn(
        {
          event: "IDEMPOTENCY_LEGACY_ROW_NO_HASH",
          clientTransactionId: transactionId,
          businessId,
        },
        "duplicate client_transaction_id: stored row has no payloadHash; soft-allow (plan backfill or sunset)"
      );
    }
    if (incomingHash && existingForBusiness.payloadHash) {
      if (!safeHexEquals(incomingHash, existingForBusiness.payloadHash)) {
        const err = new Error("Idempotent payload mismatch for this transaction id");
        err.statusCode = 409;
        err.code = "IDEMPOTENCY_PAYLOAD_MISMATCH";
        err.location = location;
        throw err;
      }
    }
    if (payload.event_id && existingForBusiness.lastProcessedEventId === payload.event_id) {
      logger.info(
        {
          event: "SYNC_DUPLICATE_EVENT",
          clientTransactionId: transactionId,
          eventId: payload.event_id,
          businessId,
        },
        "duplicate sync event ignored"
      );
    }
    return {
      status: "duplicate",
      code: "DUPLICATE_ID",
      transaction: existingForBusiness,
      syncTimestamp: existingForBusiness.syncedAt || existingForBusiness.createdAt,
    };
  }

  const existingOtherBusiness = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, businessId: true },
  });
  if (existingOtherBusiness) {
    const error = new Error("Transaction belongs to another business");
    error.statusCode = 403;
    error.location = location;
    throw error;
  }

  const productIds = items.map((item) => item.product_id);
  const products = await tx.product.findMany({
    where: { businessId, id: { in: productIds } },
  });

  if (products.length !== productIds.length) {
    const error = new Error("One or more products were not found");
    error.statusCode = 404;
    error.location = location;
    throw error;
  }

  let customer = null;
  if (customer_id) {
    customer = await tx.customer.findFirst({
      where: { id: customer_id, businessId },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!customer) {
      const error = new Error("Customer not found for this business");
      error.statusCode = 400;
      error.location = location;
      throw error;
    }
  }

  const productsById = new Map(products.map((p) => [p.id, p]));
  const lineTotals = [];
  let weightedLineCount = 0;

  for (const item of items) {
    const product = productsById.get(item.product_id);
    const qty = assertSaleQuantity(product, item.quantity, location);
    if (isMeasuredProduct(product)) weightedLineCount += 1;
    const newStock = Number(product.stock) - qty;
    if (newStock < -1e-6) {
      const error = new Error("INSUFFICIENT_STOCK");
      error.statusCode = 409;
      error.code = "INSUFFICIENT_STOCK";
      error.location = location;
      throw error;
    }
    const lineUnit = unitPriceForSale(product);
    const lineTotal = roundCurrency(qty * lineUnit);
    const unitCostAtSale = roundCurrency(Number(product.costPrice));
    const lineCost = roundCurrency(qty * unitCostAtSale);
    const lineProfit = roundCurrency(lineTotal - lineCost);
    lineTotals.push({
      product,
      item,
      qty,
      lineUnit,
      lineTotal,
      unitCostAtSale,
      lineSubtotal: lineTotal,
      lineCost,
      lineProfit,
    });
  }

  if (weightedLineCount > 0) {
    logger.info(
      {
        event: "WEIGHTED_PRODUCT_SALE",
        weightedProductSales: true,
        weightedLineCount,
        businessId,
        clientTransactionId: transactionId,
      },
      "sale includes measured (kg/litre) lines"
    );
  }

  const settings = await tx.settings.findUnique({
    where: { businessId },
    select: {
      taxEnabled: true,
      taxRate: true,
      businessName: true,
      businessEmail: true,
      businessPhone: true,
      currencySymbol: true,
    },
  });
  const taxRate = settings?.taxEnabled ? Number(settings.taxRate || 0) : 0;
  const subtotal = roundCurrency(lineTotals.reduce((s, l) => s + l.lineTotal, 0));
  const taxAmount = roundCurrency(subtotal * (taxRate / 100));
  const total = roundCurrency(subtotal + taxAmount);
  const totalCogs = roundCurrency(lineTotals.reduce((s, l) => s + l.lineCost, 0));
  const grossLineProfit = roundCurrency(lineTotals.reduce((s, l) => s + l.lineProfit, 0));

  if (payload.total != null && payload.total !== "") {
    const clientT = roundCurrency(Number(payload.total));
    if (Math.abs(clientT - total) > 0.02) {
      const error = new Error("Client total does not match server-calculated sale total");
      error.statusCode = 400;
      error.code = "CLIENT_TOTAL_MISMATCH";
      error.location = location;
      throw error;
    }
  }

  const credit = normalizeCreditFields(payload, total, location);
  assertConsistentPaymentState(total, credit.amountPaid, credit.balanceDue);

  const invariantSnapshot = validateTransactionInvariants({
    totalAmount: total,
    amountPaid: credit.amountPaid,
    balanceDue: credit.balanceDue,
    splitPayments: credit.splitPayments,
    softDriftAdjusted: credit.softDriftAdjusted,
    transactionType: "SALE",
  });
  const invariantDecision = evaluateInvariantResult(invariantSnapshot);
  if (invariantDecision.action === "BLOCK" || invariantDecision.action === "FLAG") {
    await logAudit({
      businessId,
      userId,
      action: "TRANSACTION_INVARIANT_CHECK",
      metadata: {
        level: invariantDecision.level,
        action: invariantDecision.action,
        blockCodes: invariantDecision.blockCodes,
        flagCodes: invariantDecision.flagCodes,
        transactionId,
        clientTransactionId: transactionId,
      },
    });
  }
  if (invariantDecision.action === "BLOCK") {
    const err = new Error(
      `Transaction blocked: ${invariantDecision.blockCodes.join(", ") || "invariant violation"}`
    );
    err.statusCode = 400;
    err.code = "TRANSACTION_INVARIANT_BLOCK";
    err.location = location;
    err.details = {
      blockCodes: invariantDecision.blockCodes,
      flagCodes: invariantDecision.flagCodes,
    };
    throw err;
  }
  if (invariantDecision.action === "FLAG") {
    logger.warn(
      {
        event: "TRANSACTION_INVARIANT_FLAG",
        businessId,
        clientTransactionId: transactionId,
        level: invariantDecision.level,
        flagCodes: invariantDecision.flagCodes,
      },
      "sale transaction invariant flag"
    );
  }

  const now = new Date();
  await tx.transaction.create({
    data: {
      id: transactionId,
      businessId,
      userId,
      customerId: customer?.id,
      payments: credit.splitPayments ?? undefined,
      paymentMethod: credit.paymentMethod,
      paymentStatus: credit.paymentStatus,
      amountPaid: roundCurrency(credit.amountPaid),
      balanceDue: roundCurrency(credit.balanceDue),
      dueDate: credit.dueDate,
      subtotalAmount: subtotal,
      taxAmount,
      transactionType: "SALE",
      totalCogs,
      grossLineProfit,
      totalAmount: roundCurrency(total),
      lastProcessedEventId: payload.event_id || null,
      payloadHash: payload.payload_hash || null,
      createdAt: created_at ? new Date(created_at) : now,
      syncStatus: "SYNCED",
      syncedAt: now,
    },
  });

  logUfecLedgerObservation({
    phase: "transaction_financial_record",
    eventType: "SALE_EVENT",
    clientEventId: transactionId,
    totalAmount: roundCurrency(total),
    subtotalAmount: subtotal,
    taxAmount,
    orderingNote: "financial_row_before_inventory_decrement",
  });

  for (const line of lineTotals) {
    const { product, qty } = line;
    const stockUpdated = await tx.product.updateMany({
      where: { id: product.id, businessId, stock: { gte: qty } },
      data: { stock: { decrement: qty } },
    });
    if (stockUpdated.count !== 1) {
      const error = new Error(`Inventory conflict for product ${product.name}`);
      error.statusCode = 409;
      error.location = location;
      throw error;
    }

    await tx.transactionItem.create({
      data: {
        transactionId,
        productId: product.id,
        quantity: qty,
        price: roundCurrency(line.lineUnit),
        unitCostAtSale: line.unitCostAtSale,
        lineSubtotal: line.lineSubtotal,
        lineCost: line.lineCost,
        lineProfit: line.lineProfit,
      },
    });

    const newStock = Number(product.stock) - qty;
    await recordLowStockAlertIfNeeded(tx, {
      businessId,
      plan,
      product: {
        id: product.id,
        name: product.name,
        lowStockThreshold: product.lowStockThreshold,
      },
      newStock,
      source: "transaction",
    });
  }

  if (credit.splitPayments?.length > 1) {
    logger.info(
      {
        event: "MULTI_PAYMENT_USAGE",
        multiPaymentUsage: true,
        businessId,
        transactionId,
        paymentLineCount: credit.splitPayments.length,
        totalAmount: roundCurrency(total),
      },
      "multi-payment sale recorded"
    );
  }

  if (credit.balanceDue > 0 && customer?.id) {
    const inc = roundCurrency(credit.balanceDue);
    await tx.customer.update({
      where: { id: customer.id },
      data: { totalOutstanding: { increment: inc } },
    });
    logger.info(
      {
        event: "CREDIT_CREATED",
        requestId,
        businessId,
        customerId: customer.id,
        transactionId,
        totalAmount: roundCurrency(total),
        balanceDue: inc,
        amountPaid: roundCurrency(credit.amountPaid),
      },
      "credit sale created"
    );
  }

  const hydrated = await tx.transaction.findUnique({
    where: { id: transactionId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: {
        include: { product: { select: { id: true, name: true, barcode: true } } },
      },
    },
  });

  const receipt = {
    business: {
      name: settings?.businessName || "Business",
      email: settings?.businessEmail || "",
      phone: settings?.businessPhone || "",
      currencySymbol: settings?.currencySymbol || "$",
    },
    transaction: {
      id: hydrated.id,
      paymentMethod: hydrated.paymentMethod,
      payments: hydrated.payments ?? null,
      paymentStatus: paymentStatusToApi(hydrated.paymentStatus),
      amountPaid: hydrated.amountPaid,
      balanceDue: hydrated.balanceDue,
      dueDate: hydrated.dueDate,
      dateTime: hydrated.createdAt,
      customer: hydrated.customer,
    },
    items: hydrated.items.map((item) => ({
      productName: item.product?.name || "Item",
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: roundCurrency(Number(item.price) * Number(item.quantity)),
    })),
    subtotal: roundCurrency(subtotal),
    tax: {
      enabled: Boolean(settings?.taxEnabled),
      rate: taxRate,
      amount: taxAmount,
    },
    total,
  };

  try {
    const receiptMeta = await attachReceiptArtifactsIfEnabled(tx, {
      businessId,
      plan,
      transactionId,
      receipt,
    });
    if (receiptMeta.receiptId) receipt.receiptId = receiptMeta.receiptId;
    if (receiptMeta.receiptUrl) receipt.receiptUrl = receiptMeta.receiptUrl;
  } catch (e) {
    logger.warn({ err: e.message, transactionId }, "receipt generation skipped");
  }

  return {
    status: "created",
    code: "SYNCED",
    transaction: hydrated,
    receipt,
    syncTimestamp: now,
  };
}

async function createTransactionsBulk(businessId, userId, transactions, options = {}) {
  const requestId = options.requestId || null;
  const sub = await ensureBusinessSubscription(businessId);
  const needsCredit = transactions.some((t) => {
    const ps = t.payment_status || "paid";
    return ps !== "paid";
  });
  if (needsCredit) {
    const allowed = await isFeatureEnabled(businessId, sub.plan, "CREDIT_SALES");
    if (!allowed) {
      const err = new Error("Credit sales are not enabled for this workspace");
      err.statusCode = 403;
      err.code = "FEATURE_DISABLED";
      err.location = "services/transactionService.createTransactionsBulk";
      throw err;
    }
  }

  const ordered = [...transactions].sort((a, b) => {
    const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTs !== bTs) return aTs - bTs;
    return String(a.client_transaction_id || "").localeCompare(String(b.client_transaction_id || ""));
  });

  const results = [];
  for (const payload of ordered) {
    try {
      const result = await prisma.$transaction(
        async (tx) =>
          processSingleTransaction(tx, businessId, userId, payload, { requestId, plan: sub.plan }),
        { timeout: 15_000, maxWait: 10_000 }
      );
      results.push(result);
      if (result.status === "duplicate") {
        await logAudit({
          businessId,
          userId,
          action: "SYNC_DUPLICATE_TRANSACTION",
          metadata: { transactionId: payload.client_transaction_id },
        });
      } else if (result.status === "created") {
        await resolveRetryMetricIfNeeded({
          businessId,
          userId,
          transactionId: payload.client_transaction_id,
          successAt: result.syncTimestamp || new Date(),
        });
      }
    } catch (error) {
      if (error.statusCode === 409 && error.code === "INSUFFICIENT_STOCK") {
        await logAudit({
          businessId,
          userId,
          action: "SYNC_INVENTORY_CONFLICT",
          metadata: {
            transactionId: payload.client_transaction_id,
            message: error.message,
          },
        });
      }
      const code =
        error.code === "INSUFFICIENT_STOCK"
          ? "INSUFFICIENT_STOCK"
          : error.code === "IDEMPOTENCY_PAYLOAD_MISMATCH"
            ? "IDEMPOTENCY_PAYLOAD_MISMATCH"
            : error.code === "INCONSISTENT_PAYMENT_STATE"
              ? "INCONSISTENT_PAYMENT_STATE"
              : error.code === "TRANSACTION_INVARIANT_BLOCK"
                ? "TRANSACTION_INVARIANT_BLOCK"
                : error.code === "PAYMENT_SPLIT_MISMATCH"
                  ? "PAYMENT_SPLIT_MISMATCH"
                  : error.code === "INVALID_ITEM_QUANTITY"
                  ? "INVALID_ITEM_QUANTITY"
                  : error.statusCode === 400
                    ? error.code || "VALIDATION_FAILED"
                    : "TRANSIENT_SYNC_FAILURE";
      if (code === "TRANSIENT_SYNC_FAILURE") {
        await logAudit({
          businessId,
          userId,
          action: "SYNC_RETRY_FAILED",
          metadata: {
            transactionId: payload.client_transaction_id,
            message: error.message || "Temporary sync failure",
          },
        });
      }
      results.push({
        status: "failed",
        transactionId: payload.client_transaction_id,
        code,
        message: error.message || "Failed to process transaction",
        location: error.location || "services/transactionService.createTransactionsBulk",
      });
    }
  }

  if (results.some((r) => r.status === "created")) {
    await markFirstSaleDone(businessId);
    await logAudit({
      businessId,
      userId,
      action: "TRANSACTION_CREATED",
      metadata: {
        count: results.filter((r) => r.status === "created").length,
      },
    });
  }
  return results;
}

async function debugTransaction(businessId, transactionId) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, businessId },
  });
  if (!tx) return null;
  return {
    transaction: tx,
    settlements: [],
    computedBalance: roundCurrency(Number(tx.totalAmount) - Number(tx.amountPaid)),
  };
}

async function listTransactions(businessId) {
  const rows = await prisma.transaction.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, barcode: true } },
        },
      },
    },
  });
  return rows.map((r) => mapTransactionPaymentFields(r));
}

/** `Transaction.id` equals the client's `client_transaction_id` for synced sales. */
async function findTransactionForBusinessById(businessId, transactionId) {
  const row = await prisma.transaction.findFirst({
    where: { id: transactionId, businessId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, barcode: true } },
        },
      },
    },
  });
  if (!row) return null;
  return mapTransactionPaymentFields(row);
}

const { createReturnTransaction } = require("./returnService");

module.exports = {
  createTransactionsBulk,
  createReturnTransaction,
  listTransactions,
  findTransactionForBusinessById,
  settleTransactionCredit,
  getCustomerOutstanding,
  mapTransactionPaymentFields,
  debugTransaction,
};
