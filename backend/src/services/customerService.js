const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { sanitizeDisplayName, normalizeEmail, sanitizePlainText } = require("../utils/sanitize");
const { assertCustomerQuota } = require("./usageQuotaService");
const { logAudit } = require("./auditService");
const {
  computePaymentState,
  roundCurrency,
  assertConsistentPaymentState,
} = require("../utils/paymentState");

async function listCustomers(businessId) {
  return prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

async function createCustomer(businessId, payload, userId) {
  await assertCustomerQuota(businessId, { userId });
  const { id, ...rest } = payload;
  const name = sanitizeDisplayName(rest.name, 200);
  const email =
    rest.email == null || rest.email === "" ? rest.email : normalizeEmail(rest.email);
  const phone =
    rest.phone == null || rest.phone === "" ? rest.phone : sanitizePlainText(rest.phone, 40);
  return prisma.customer.create({
    data: {
      ...(id ? { id } : {}),
      businessId,
      ...rest,
      name,
      email,
      phone,
    },
  });
}

async function updateCustomer(businessId, customerId, payload) {
  const { lastKnownUpdatedAt, force, ...raw } = payload;
  const forceOverwrite = Boolean(force);
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { id: true, updatedAt: true },
  });
  if (!existing) {
    const error = new Error("Customer not found");
    error.statusCode = 404;
    throw error;
  }

  if (lastKnownUpdatedAt == null || lastKnownUpdatedAt === "") {
    const error = new Error("lastKnownUpdatedAt is required");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    throw error;
  }

  const clientTs = new Date(lastKnownUpdatedAt);
  const serverTs = new Date(existing.updatedAt);
  if (Number.isNaN(clientTs.getTime())) {
    const error = new Error("Invalid lastKnownUpdatedAt");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  if (!forceOverwrite && clientTs.getTime() < serverTs.getTime()) {
    const serverIso = existing.updatedAt.toISOString();
    const clientIso =
      typeof lastKnownUpdatedAt === "string" ? lastKnownUpdatedAt : clientTs.toISOString();
    logger.warn(
      {
        event: "CONFLICT_DETECTED",
        recordId: customerId,
        clientUpdatedAt: clientIso,
        serverUpdatedAt: serverIso,
      },
      "customer update conflict"
    );
    const error = new Error("Record has been updated by another source");
    error.statusCode = 409;
    error.code = "CONFLICT";
    error.conflictData = {
      recordId: customerId,
      serverUpdatedAt: serverIso,
      clientUpdatedAt: clientIso,
    };
    throw error;
  }

  const data = { ...raw };
  if (data.name !== undefined) {
    data.name = sanitizeDisplayName(data.name, 200);
  }
  if (data.email !== undefined && data.email !== null && data.email !== "") {
    data.email = normalizeEmail(data.email);
  }
  if (data.phone !== undefined && data.phone !== null && data.phone !== "") {
    data.phone = sanitizePlainText(data.phone, 40);
  }

  return prisma.customer.update({
    where: { id: customerId },
    data,
  });
}

/**
 * FIFO settlement across open sale rows (oldest balance first). Idempotent via request_id.
 */
async function settleCustomerCredit(businessId, customerId, amount, userId, requestId) {
  const rounded = roundCurrency(Number(amount));
  if (rounded <= 0) {
    const err = new Error("amount must be positive");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  return prisma.$transaction(
    async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, businessId },
      });
      if (!customer) {
        const err = new Error("Customer not found");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }

      if (requestId && customer.lastCreditSettlementRequestId === requestId) {
        return customer;
      }

      const due = roundCurrency(Number(customer.totalOutstanding || 0));
      if (rounded > due + 0.0001) {
        logger.warn(
          { event: "OVERPAYMENT_ATTEMPT", customerId, amount: rounded, due, businessId },
          "aggregate customer settle overpay"
        );
        const err = new Error("amount exceeds total outstanding");
        err.statusCode = 400;
        err.code = "EXCEEDS_OUTSTANDING";
        throw err;
      }

      const rows = await tx.transaction.findMany({
        where: { customerId, businessId, balanceDue: { gt: 0 } },
        orderBy: { createdAt: "asc" },
      });

      if (!rows.length && rounded > 0) {
        const err = new Error("No outstanding sale rows to apply payment against");
        err.statusCode = 409;
        err.code = "NO_OUTSTANDING_BALANCE";
        throw err;
      }

      let remaining = rounded;
      for (const row of rows) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, roundCurrency(row.balanceDue));
        const state = computePaymentState(row.totalAmount, row.amountPaid + apply);
        assertConsistentPaymentState(row.totalAmount, state.amountPaid, state.balanceDue);
        await tx.transaction.update({
          where: { id: row.id },
          data: {
            amountPaid: roundCurrency(state.amountPaid),
            balanceDue: roundCurrency(state.balanceDue),
            paymentStatus: state.paymentStatus,
          },
        });
        remaining = roundCurrency(remaining - apply);
      }

      if (remaining > 0.0001) {
        const err = new Error("Could not allocate settlement");
        err.statusCode = 409;
        err.code = "SETTLEMENT_CONFLICT";
        throw err;
      }

      const upd = await tx.customer.updateMany({
        where: { id: customerId, businessId, totalOutstanding: { gte: rounded } },
        data: {
          totalOutstanding: { decrement: rounded },
          lastCreditSettlementRequestId: requestId || null,
        },
      });
      if (upd.count !== 1) {
        const err = new Error("Could not apply settlement");
        err.statusCode = 409;
        err.code = "SETTLEMENT_CONFLICT";
        throw err;
      }

      await logAudit({
        businessId,
        userId,
        action: "CREDIT_SETTLED",
        metadata: { customerId, amount: rounded, requestId: requestId || null, mode: "aggregate_fifo" },
      });

      const finalC = await tx.customer.findUnique({ where: { id: customerId } });
      logger.info(
        {
          event: "PAYMENT_SETTLED",
          requestId,
          customerId,
          amount: rounded,
          businessId,
          remainingBalance: roundCurrency(Number(finalC?.totalOutstanding || 0)),
        },
        "aggregate credit settled"
      );

      return finalC;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 20_000,
      maxWait: 10_000,
    }
  );
}

module.exports = { listCustomers, createCustomer, updateCustomer, settleCustomerCredit };
