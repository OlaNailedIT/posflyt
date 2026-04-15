const { test } = require("node:test");
const assert = require("node:assert/strict");
const { AppError } = require("../src/utils/AppError");
const { normalizeRange, assertExpenseConsistency } = require("../src/services/expenseService");

test("normalizeRange defaults to UTC today when both bounds missing", () => {
  const r = normalizeRange(null, null);
  assert.ok(r.from.getTime() <= r.to.getTime());
});

test("normalizeRange rejects inverted range", () => {
  const from = new Date("2026-04-10T00:00:00.000Z");
  const to = new Date("2026-04-01T00:00:00.000Z");
  assert.throws(
    () => normalizeRange(from, to),
    (err) => err.code === "INVALID_RANGE"
  );
});

test("normalizeRange rejects single bound", () => {
  const from = new Date("2026-04-01T00:00:00.000Z");
  assert.throws(
    () => normalizeRange(from, null),
    (err) => err.code === "INVALID_RANGE"
  );
});

test("assertExpenseConsistency rejects negative aggregates", () => {
  assert.throws(
    () => assertExpenseConsistency(-0.01),
    (err) => err instanceof AppError && err.code === "INVALID_EXPENSE_STATE"
  );
});
