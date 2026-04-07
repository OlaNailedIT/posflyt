const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");

async function listCustomers(businessId) {
  return prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

async function createCustomer(businessId, payload) {
  const { id, ...rest } = payload;
  return prisma.customer.create({
    data: {
      ...(id ? { id } : {}),
      businessId,
      ...rest,
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

  return prisma.customer.update({
    where: { id: customerId },
    data: raw,
  });
}

module.exports = { listCustomers, createCustomer, updateCustomer };
