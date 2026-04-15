const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateTransactionInvariants,
  evaluateInvariantResult,
  assertLedgerBalanced,
} = require("../src/services/financialInvariantService");

test("validateTransactionInvariants: balanced sale passes", () => {
  const inv = validateTransactionInvariants({
    totalAmount: 100,
    amountPaid: 60,
    balanceDue: 40,
    transactionType: "SALE",
  });
  assert.deepEqual(inv.blockCodes, []);
  assert.deepEqual(inv.flagCodes, []);
  assert.equal(evaluateInvariantResult(inv).action, "ALLOW");
});

test("validateTransactionInvariants: payment pair mismatch blocks", () => {
  const inv = validateTransactionInvariants({
    totalAmount: 100,
    amountPaid: 50,
    balanceDue: 40,
    transactionType: "SALE",
  });
  assert.ok(inv.blockCodes.includes("PAYMENT_MISMATCH"));
  assert.equal(evaluateInvariantResult(inv).action, "BLOCK");
});

test("validateTransactionInvariants: RETURN allows negative total", () => {
  const inv = validateTransactionInvariants({
    totalAmount: -50,
    amountPaid: -50,
    balanceDue: 0,
    transactionType: "RETURN",
    originalTransactionId: "orig-1",
  });
  assert.deepEqual(inv.blockCodes, []);
});

test("validateTransactionInvariants: RETURN without original blocks", () => {
  const inv = validateTransactionInvariants({
    totalAmount: -10,
    amountPaid: -10,
    balanceDue: 0,
    transactionType: "RETURN",
    originalTransactionId: null,
  });
  assert.ok(inv.blockCodes.includes("MISSING_ORIGINAL_TRANSACTION"));
});

test("validateTransactionInvariants: drift corrected flags", () => {
  const inv = validateTransactionInvariants({
    totalAmount: 100,
    amountPaid: 100,
    balanceDue: 0,
    transactionType: "SALE",
    softDriftAdjusted: true,
  });
  assert.ok(inv.flagCodes.includes("PAYMENT_DRIFT_CORRECTED"));
  assert.equal(evaluateInvariantResult(inv).action, "FLAG");
});

test("assertLedgerBalanced: debits equal credits", () => {
  const r = assertLedgerBalanced([
    { debit: 10, credit: 0 },
    { debit: 0, credit: 10 },
  ]);
  assert.equal(r.balanced, true);
});

test("assertLedgerBalanced: detects drift", () => {
  const r = assertLedgerBalanced([
    { debit: 10, credit: 0 },
    { debit: 0, credit: 9 },
  ]);
  assert.equal(r.balanced, false);
});
