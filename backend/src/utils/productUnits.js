const MEASURED_UNIT_TYPES = new Set(["kg", "litre"]);
const ALLOWED_UNIT_TYPES = new Set(["unit", "kg", "litre"]);

function normalizeUnitType(value) {
  const u = String(value || "unit").toLowerCase();
  if (u === "liter") return "litre";
  return ALLOWED_UNIT_TYPES.has(u) ? u : "unit";
}

function unitTypeOf(product) {
  return normalizeUnitType(product?.unitType);
}

function isMeasuredProduct(product) {
  return MEASURED_UNIT_TYPES.has(unitTypeOf(product));
}

/** Line unit price: per piece for discrete, per kg/litre for measured. */
function unitPriceForSale(product) {
  if (isMeasuredProduct(product)) {
    return Number(product.pricePerUnit ?? product.price ?? 0);
  }
  return Number(product.sellingPrice ?? product.price ?? 0);
}

/**
 * @returns {number} validated quantity
 */
function assertSaleQuantity(product, qtyRaw, location) {
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty) || qty <= 0) {
    const err = new Error("Invalid item quantity");
    err.statusCode = 400;
    err.code = "INVALID_ITEM_QUANTITY";
    err.location = location;
    throw err;
  }
  if (isMeasuredProduct(product)) {
    return qty;
  }
  const rounded = Math.round(qty);
  if (Math.abs(qty - rounded) > 1e-6) {
    const err = new Error("Discrete products require a whole-number quantity");
    err.statusCode = 400;
    err.code = "INVALID_ITEM_QUANTITY";
    err.location = location;
    throw err;
  }
  return rounded;
}

module.exports = {
  MEASURED_UNIT_TYPES,
  ALLOWED_UNIT_TYPES,
  normalizeUnitType,
  unitTypeOf,
  isMeasuredProduct,
  unitPriceForSale,
  assertSaleQuantity,
};
