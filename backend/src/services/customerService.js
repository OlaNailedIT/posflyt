const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { sanitizeDisplayName, normalizeEmail, sanitizePlainText } = require("../utils/sanitize");
const { assertCustomerQuota } = require("./usageQuotaService");

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

module.exports = { listCustomers, createCustomer, updateCustomer };
