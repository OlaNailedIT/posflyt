const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { PLAN_LIMITS, ensureBusinessSubscription } = require("./subscriptionService");
const { markFirstProductDone } = require("./onboardingService");
const { logAudit } = require("./auditService");
const { logger } = require("../utils/logger");
const { sanitizeDisplayName, sanitizeProductCode } = require("../utils/sanitize");

async function listProducts(businessId) {
  return prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

async function createProduct(businessId, payload, userId) {
  const subscription = await ensureBusinessSubscription(businessId);
  const maxProducts = PLAN_LIMITS[subscription.plan]?.maxProducts || PLAN_LIMITS.FREE.maxProducts;
  const productsCount = await prisma.product.count({ where: { businessId } });
  if (productsCount >= maxProducts) {
    const error = new Error(`Plan limit reached. ${subscription.plan} allows up to ${maxProducts} products.`);
    error.statusCode = 403;
    throw error;
  }

  const { id, ...rest } = payload;
  const sellingPrice = rest.sellingPrice ?? rest.price ?? 0;
  const costPrice = rest.costPrice ?? 0;
  const price = rest.price ?? sellingPrice;
  const name = sanitizeDisplayName(rest.name, 200);
  const barcode =
    rest.barcode == null || rest.barcode === ""
      ? rest.barcode
      : sanitizeProductCode(rest.barcode, 128);
  const created = await prisma.product.create({
    data: {
      id: id || randomUUID(),
      ...rest,
      name,
      barcode,
      price,
      sellingPrice,
      costPrice,
      businessId,
    },
  });
  await markFirstProductDone(businessId);
  await logAudit({
    businessId,
    userId,
    action: "PRODUCT_CREATED",
    metadata: { productId: created.id, name: created.name },
  });
  return created;
}

async function updateProduct(businessId, productId, payload, userId) {
  const { lastKnownUpdatedAt, force, ...raw } = payload;
  const forceOverwrite = Boolean(force);
  const existing = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });
  if (!existing) {
    const error = new Error("Product not found");
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
        recordId: productId,
        clientUpdatedAt: clientIso,
        serverUpdatedAt: serverIso,
      },
      "product update conflict"
    );
    const error = new Error("Record has been updated by another source");
    error.statusCode = 409;
    error.code = "CONFLICT";
    error.conflictData = {
      recordId: productId,
      serverUpdatedAt: serverIso,
      clientUpdatedAt: clientIso,
    };
    throw error;
  }

  const data = { ...raw };
  if (data.name !== undefined) {
    data.name = sanitizeDisplayName(data.name, 200);
  }
  if (data.barcode !== undefined && data.barcode !== null && data.barcode !== "") {
    data.barcode = sanitizeProductCode(data.barcode, 128);
  }
  if (data.sellingPrice !== undefined && data.price === undefined) {
    data.price = data.sellingPrice;
  }
  if (data.price !== undefined && data.sellingPrice === undefined) {
    data.sellingPrice = data.price;
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data,
  });
  await logAudit({
    businessId,
    userId,
    action: "PRODUCT_UPDATED",
    metadata: { productId: updated.id },
  });
  return updated;
}

module.exports = { listProducts, createProduct, updateProduct };
