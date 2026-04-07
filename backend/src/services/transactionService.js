const { markFirstSaleDone } = require("./onboardingService");
const { logAudit } = require("./auditService");
const { recordSyncRetryResolution } = require("./runtimeMetricsService");
const prisma = require("../config/prisma");

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
      successAt: new Date(successAt).toISOString(),
      resolutionMs,
    },
  });
}

async function processSingleTransaction(tx, businessId, userId, payload) {
  const location = "services/transactionService.processSingleTransaction";
  const { payment_method, items, client_transaction_id, created_at, customer_id } = payload;

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

  const existingForBusiness = await tx.transaction.findUnique({
    where: {
      client_transaction_id_business_id: {
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
  let subtotal = 0;

  for (const item of items) {
    const product = productsById.get(item.product_id);
    if (product.stock < item.quantity) {
      const error = new Error(`Insufficient stock for product ${product.name}`);
      error.statusCode = 409;
      error.location = location;
      throw error;
    }
    subtotal += Number(product.sellingPrice || product.price) * item.quantity;
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
  const taxAmount = roundCurrency(subtotal * (taxRate / 100));
  const total = roundCurrency(subtotal + taxAmount);

  const now = new Date();
  await tx.transaction.create({
    data: {
      id: transactionId,
      businessId,
      userId,
      customerId: customer?.id,
      paymentMethod: payment_method,
      total,
      createdAt: created_at ? new Date(created_at) : now,
      syncStatus: "SYNCED",
      syncedAt: now,
    },
  });

  for (const item of items) {
    const product = productsById.get(item.product_id);
    const stockUpdated = await tx.product.updateMany({
      where: { id: product.id, businessId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
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
        productId: item.product_id,
        quantity: item.quantity,
        price: Number(product.sellingPrice || product.price),
      },
    });
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

  return { status: "created", code: "SYNCED", transaction: hydrated, receipt, syncTimestamp: now };
}

async function createTransactionsBulk(businessId, userId, transactions) {
  const ordered = [...transactions].sort((a, b) => {
    const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTs !== bTs) return aTs - bTs;
    return String(a.client_transaction_id || "").localeCompare(String(b.client_transaction_id || ""));
  });

  const results = [];
  for (const payload of ordered) {
    try {
      const result = await prisma.$transaction(async (tx) =>
        processSingleTransaction(tx, businessId, userId, payload)
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
      if (error.statusCode === 409) {
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
        error.statusCode === 409
          ? "INVENTORY_CONFLICT"
          : error.statusCode === 400
            ? "VALIDATION_FAILED"
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

async function listTransactions(businessId) {
  return prisma.transaction.findMany({
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
}

module.exports = { createTransactionsBulk, listTransactions };
