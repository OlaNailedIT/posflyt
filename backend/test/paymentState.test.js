const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  computePaymentState,
  roundCurrency,
  assertConsistentPaymentState,
} = require("../src/utils/paymentState");

test("computePaymentState: full, partial, credit, zero total", () => {
  assert.deepEqual(computePaymentState(100, 100), {
    amountPaid: 100,
    balanceDue: 0,
    paymentStatus: "PAID",
  });
  assert.deepEqual(computePaymentState(100, 40), {
    amountPaid: 40,
    balanceDue: 60,
    paymentStatus: "PARTIAL",
  });
  assert.deepEqual(computePaymentState(100, 0), {
    amountPaid: 0,
    balanceDue: 100,
    paymentStatus: "CREDIT",
  });
  assert.deepEqual(computePaymentState(0, 0), {
    amountPaid: 0,
    balanceDue: 0,
    paymentStatus: "PAID",
  });
});

test("computePaymentState: clamps overpay and large numbers", () => {
  const s = computePaymentState(999999.99, 999999.99);
  assert.equal(s.paymentStatus, "PAID");
  assert.equal(s.balanceDue, 0);
  const over = computePaymentState(100, 200);
  assert.equal(over.amountPaid, 100);
  assert.equal(over.balanceDue, 0);
  assert.equal(over.paymentStatus, "PAID");
});

test("roundCurrency", () => {
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(1.005, 2), 1.01);
  assert.equal(roundCurrency(1.23456, 2), 1.23);
});

test("assertConsistentPaymentState accepts balanced rows", () => {
  assert.doesNotThrow(() => assertConsistentPaymentState(100, 40, 60));
});

test("assertConsistentPaymentState rejects drift", () => {
  assert.throws(
    () => assertConsistentPaymentState(100, 40, 10),
    (e) => e.code === "INCONSISTENT_PAYMENT_STATE"
  );
});
