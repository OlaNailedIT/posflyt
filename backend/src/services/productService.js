const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { assertProductQuota } = require("./usageQuotaService");
const { markFirstProductDone } = require("./onboardingService");
const { logAudit } = require("./auditService");
const { logger } = require("../utils/logger");
const { sanitizeDisplayName, sanitizeProductCode } = require("../utils/sanitize");
const { normalizeUnitType } = require("../utils/productUnits");

/** DPE: require non-negative cost and positive sell price (per unit for measured goods). */
function assertProductEconomics({ unitType, costPrice, sellingPrice, price, pricePerUnit }) {
  const cp = Number(costPrice);
  if (!Number.isFinite(cp) || cp < 0) {
    const error = new Error("costPrice is required and must be a non-negative number");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  const ut = normalizeUnitType(unitType || "unit");
  if (ut === "unit") {
    const sp = Number(sellingPrice ?? price ?? 0);
    if (!Number.isFinite(sp) || sp <= 0) {
      const error = new Error("Selling price must be greater than zero");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      throw error;
    }
  } else {
    const ppu = pricePerUnit != null ? Number(pricePerUnit) : Number(price ?? sellingPrice ?? 0);
    if (!Number.isFinite(ppu) || ppu <= 0) {
      const error = new Error("pricePerUnit must be greater than zero for measured products");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      throw error;
    }
  }
}

function normalizeLowStockThreshold(raw) {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function listProducts(businessId) {
  return prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

/** Barcode lookup for inventory count / POS (sanitized exact match on `Product.barcode`). */
async function findProductByBarcode(businessId, rawCode) {
  const trimmed = String(rawCode ?? "").trim();
  if (!trimmed) return null;
  const code = sanitizeProductCode(trimmed, 128);
  if (!code) return null;
  return prisma.product.findFirst({
    where: { businessId, barcode: code },
  });
}

async function createProduct(businessId, payload, userId) {
  await ensureBusinessSubscription(businessId);
  await assertProductQuota(businessId, { userId });

  const { id, ...rest } = payload;
  const unitType = normalizeUnitType(rest.unitType);
  const costPrice = Number(rest.costPrice ?? 0);
  const stock = Number(rest.stock);
  const lowStockThreshold = normalizeLowStockThreshold(rest.lowStockThreshold);

  let sellingPrice = Number(rest.sellingPrice ?? rest.price ?? 0);
  let price = Number(rest.price ?? sellingPrice);
  let pricePerUnit = rest.pricePerUnit != null ? Number(rest.pricePerUnit) : null;

  if (unitType !== "unit") {
    const ppu = pricePerUnit ?? price;
    if (ppu == null || !Number.isFinite(Number(ppu)) || Number(ppu) <= 0) {
      const error = new Error("pricePerUnit is required for measured products (kg, litre)");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      throw error;
    }
    pricePerUnit = Number(ppu);
    price = pricePerUnit;
    sellingPrice = pricePerUnit;
  } else {
    pricePerUnit = null;
  }

  assertProductEconomics({
    unitType,
    costPrice,
    sellingPrice,
    price,
    pricePerUnit,
  });

  const name = sanitizeDisplayName(rest.name, 200);
  const barcode =
    rest.barcode == null || rest.barcode === ""
      ? rest.barcode
      : sanitizeProductCode(rest.barcode, 128);
  const created = await prisma.product.create({
    data: {
      id: id || randomUUID(),
      name,
      barcode,
      price,
      sellingPrice,
      costPrice,
      stock,
      lowStockThreshold,
      unitType,
      pricePerUnit,
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
  if (data.unitType !== undefined) {
    data.unitType = normalizeUnitType(data.unitType);
  }
  if (data.sellingPrice !== undefined && data.price === undefined) {
    data.price = data.sellingPrice;
  }
  if (data.price !== undefined && data.sellingPrice === undefined) {
    data.sellingPrice = data.price;
  }

  const nextUnitType = data.unitType !== undefined ? data.unitType : existing.unitType;
  const normalizedNext = normalizeUnitType(nextUnitType);
  if (normalizedNext !== "unit") {
    const ppu =
      data.pricePerUnit != null
        ? Number(data.pricePerUnit)
        : data.price != null
          ? Number(data.price)
          : existing.pricePerUnit != null
            ? Number(existing.pricePerUnit)
            : Number(existing.price);
    if (!Number.isFinite(ppu) || ppu <= 0) {
      const error = new Error("pricePerUnit is required for measured products (kg, litre)");
      error.statusCode = 400;
      error.code = "VALIDATION_FAILED";
      throw error;
    }
    data.pricePerUnit = ppu;
    data.price = ppu;
    data.sellingPrice = ppu;
  } else if (data.unitType !== undefined) {
    data.pricePerUnit = null;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "lowStockThreshold")) {
    data.lowStockThreshold = normalizeLowStockThreshold(raw.lowStockThreshold);
  }

  const mergedCost =
    data.costPrice !== undefined ? Number(data.costPrice) : Number(existing.costPrice);
  const mergedUnit = data.unitType !== undefined ? normalizeUnitType(data.unitType) : existing.unitType;
  const mergedSelling =
    data.sellingPrice !== undefined
      ? Number(data.sellingPrice)
      : data.price !== undefined
        ? Number(data.price)
        : Number(existing.sellingPrice);
  const mergedPpu =
    data.pricePerUnit !== undefined
      ? data.pricePerUnit
      : mergedUnit !== "unit"
        ? existing.pricePerUnit
        : null;
  assertProductEconomics({
    unitType: mergedUnit,
    costPrice: mergedCost,
    sellingPrice: mergedSelling,
    price: data.price !== undefined ? Number(data.price) : Number(existing.price),
    pricePerUnit: mergedPpu != null ? Number(mergedPpu) : null,
  });

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

module.exports = { listProducts, createProduct, updateProduct, findProductByBarcode };
