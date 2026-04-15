const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseSplitPayments } = require("../src/utils/splitPayments");

test("parseSplitPayments returns null when payments omitted", () => {
  assert.equal(parseSplitPayments({ payment_method: "CASH" }, 100, "t"), null);
});

test("parseSplitPayments validates sum equals total", () => {
  const out = parseSplitPayments(
    {
      payments: [
        { type: "CASH", amount: 40 },
        { type: "TRANSFER", amount: 60 },
      ],
      payment_status: "paid",
    },
    100,
    "t"
  );
  assert.equal(out.paymentMethod, "MULTI");
  assert.equal(out.payments.length, 2);
  assert.equal(out.amountPaid, 100);
  assert.equal(out.balanceDue, 0);
});

test("parseSplitPayments single line uses that method", () => {
  const out = parseSplitPayments(
    { payments: [{ type: "card", amount: 50 }], payment_status: "paid" },
    50,
    "t"
  );
  assert.equal(out.paymentMethod, "CARD");
});

test("parseSplitPayments rejects mismatch", () => {
  assert.throws(
    () =>
      parseSplitPayments(
        {
          payments: [
            { type: "CASH", amount: 10 },
            { type: "TRANSFER", amount: 20 },
          ],
        },
        100,
        "t"
      ),
    (e) => e.code === "PAYMENT_SPLIT_MISMATCH"
  );
});

test("parseSplitPayments soft-adjusts minor split drift and flags", () => {
  const out = parseSplitPayments(
    {
      payments: [
        { type: "CASH", amount: 2500 },
        { type: "TRANSFER", amount: 2499 },
      ],
      payment_status: "paid",
    },
    5000,
    "t"
  );
  assert.equal(out.softDriftAdjusted, true);
  assert.equal(out.amountPaid, 5000);
  assert.equal(out.balanceDue, 0);
  const sum = out.payments.reduce((s, p) => s + p.amount, 0);
  assert.ok(Math.abs(sum - 5000) < 0.01);
});

test("parseSplitPayments rejects partial sale", () => {
  assert.throws(
    () =>
      parseSplitPayments(
        {
          payments: [{ type: "CASH", amount: 50 }],
          payment_status: "partial",
          amount_paid: 50,
        },
        100,
        "t"
      ),
    (e) => e.code === "VALIDATION_FAILED"
  );
});
