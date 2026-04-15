const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUnitType,
  unitPriceForSale,
  assertSaleQuantity,
} = require("../src/utils/productUnits");

test("normalizeUnitType maps liter to litre", () => {
  assert.equal(normalizeUnitType("liter"), "litre");
  assert.equal(normalizeUnitType("KG"), "kg");
});

test("unitPriceForSale uses pricePerUnit for kg", () => {
  assert.equal(
    unitPriceForSale({ unitType: "kg", pricePerUnit: 500, price: 500 }),
    500
  );
});

test("assertSaleQuantity rejects fraction for discrete product", () => {
  assert.throws(
    () => assertSaleQuantity({ unitType: "unit", price: 10 }, 1.5, "t"),
    (e) => e.code === "INVALID_ITEM_QUANTITY"
  );
});

test("assertSaleQuantity allows fraction for kg", () => {
  assert.equal(assertSaleQuantity({ unitType: "kg", pricePerUnit: 100, price: 100 }, 2.25, "t"), 2.25);
});
