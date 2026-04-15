const test = require("node:test");
const assert = require("node:assert/strict");
const { isLowStockCondition } = require("../src/utils/lowStock");

test("isLowStockCondition: null threshold = no alert", () => {
  assert.equal(isLowStockCondition(0, null), false);
  assert.equal(isLowStockCondition(100, null), false);
});

test("isLowStockCondition: zero or negative threshold = no alert", () => {
  assert.equal(isLowStockCondition(0, 0), false);
  assert.equal(isLowStockCondition(0, -1), false);
});

test("isLowStockCondition: stock at or below positive threshold", () => {
  assert.equal(isLowStockCondition(5, 10), true);
  assert.equal(isLowStockCondition(10, 10), true);
  assert.equal(isLowStockCondition(11, 10), false);
});
