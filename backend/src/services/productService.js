const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { PLAN_LIMITS, ensureBusinessSubscription } = require("./subscriptionService");
const { markFirstProductDone } = require("./onboardingService");
const { logAudit } = require("./auditService");

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
  const created = await prisma.product.create({
    data: {
      id: id || randomUUID(),
      ...rest,
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
  const existing = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });
  if (!existing) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...payload,
      ...(payload.sellingPrice !== undefined && payload.price === undefined
        ? { price: payload.sellingPrice }
        : {}),
      ...(payload.price !== undefined && payload.sellingPrice === undefined
        ? { sellingPrice: payload.price }
        : {}),
    },
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
