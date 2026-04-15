const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compareLedgerProjection } = require("../src/reconciliation/comparisonEngine");

test("compareLedgerProjection detects EXTRA and MISSING lines", () => {
  const expected = [
    {
      ledgerLineId: "a::ledger::SALE::e1",
      lineKind: "SALE",
      debit: 0,
      credit: 10,
      balanceAfter: 10,
      sourceEventId: "e1",
    },
  ];
  const stored = [
    {
      ledgerLineId: "orphan",
      lineKind: "SALE",
      debit: 0,
      credit: 5,
      balanceAfter: 5,
      sourceEventId: "x",
    },
  ];
  const terminalState = { runningNet: 10 };
  const out = compareLedgerProjection(expected, stored, terminalState);
  assert.equal(out.match, false);
  assert.ok(out.mismatches.some((m) => m.code === "MISSING_LEDGER_LINE"));
  assert.ok(out.mismatches.some((m) => m.code === "EXTRA_LEDGER_LINE"));
});
