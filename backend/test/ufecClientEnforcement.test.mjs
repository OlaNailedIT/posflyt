/**
 * Phase 2 Step 5 — UFEC enforcement classifier + decision engine (client modules via ESM import).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fin = pathToFileURL(join(root, "src/financial/")).href;

const { FINANCIAL_EVENT_TYPE } = await import(new URL("ufecSyncShadow.js", fin));
const {
  compareExpectedVsActualLedger,
  simulateExpectedLedger,
  extractActualLedgerFromResult,
  buildLedgerComparison,
  applyUfecPostExecutionEnforcement,
} = await import(new URL("ufecLedgerShadow.js", fin));
const {
  evaluateUfecEnforcement,
  ENFORCEMENT_ACTION,
  preflightUfecCriticalBlock,
  UfecEnforcementError,
} = await import(new URL("ufecEnforcement.js", fin));

test("TEST 1 — normal sale: LEVEL 0 ALLOW", () => {
  const event = {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: "sale-1",
    payload: { client_transaction_id: "sale-1", total: 100 },
  };
  const expected = simulateExpectedLedger(event);
  const actual = extractActualLedgerFromResult(event, {
    results: [{ status: "created", transaction: { totalAmount: 100 } }],
  });
  const cmp = compareExpectedVsActualLedger(event, expected, actual);
  assert.equal(cmp.enforcementLevel, 0);
  assert.equal(cmp.status, "MATCH");
  const d = evaluateUfecEnforcement(event, cmp);
  assert.equal(d.action, ENFORCEMENT_ACTION.ALLOW);
});

test("TEST 2 — small price difference: LEVEL 1 WARN", () => {
  const event = {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: "sale-2",
    payload: { client_transaction_id: "sale-2", total: 100 },
  };
  const expected = simulateExpectedLedger(event);
  const actual = extractActualLedgerFromResult(event, {
    results: [{ status: "created", transaction: { totalAmount: 100.05 } }],
  });
  const cmp = compareExpectedVsActualLedger(event, expected, actual);
  assert.equal(cmp.enforcementLevel, 1);
  const d = evaluateUfecEnforcement(event, cmp);
  assert.equal(d.action, ENFORCEMENT_ACTION.WARN);
});

test("TEST 3 — missing ledger row (orphan): LEVEL 2 FLAG", () => {
  const event = {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: "sale-3",
    payload: { client_transaction_id: "sale-3", total: 50 },
  };
  const expected = simulateExpectedLedger(event);
  const actual = extractActualLedgerFromResult(event, {
    results: [{ status: "created", transaction: null }],
  });
  const cmp = compareExpectedVsActualLedger(event, expected, actual);
  assert.equal(cmp.status, "ORPHAN");
  assert.equal(cmp.enforcementLevel, 2);
  const d = evaluateUfecEnforcement(event, cmp);
  assert.equal(d.action, ENFORCEMENT_ACTION.FLAG);
});

test("TEST 4 — invalid return (no original_transaction_id): preflight BLOCK RECONCILE_REQUIRED", () => {
  const event = {
    type: FINANCIAL_EVENT_TYPE.RETURN_EVENT,
    clientEventId: "ret-1",
    payload: {},
  };
  const pre = preflightUfecCriticalBlock(event);
  assert.equal(pre.blocked, true);
  assert.throws(
    () => {
      const p = preflightUfecCriticalBlock(event);
      if (p.blocked) {
        throw new UfecEnforcementError(p.reason, { level: 3, phase: "preflight" });
      }
    },
    (e) => e instanceof UfecEnforcementError && e.code === "RECONCILE_REQUIRED"
  );
});

test("post-execution: negative authoritative sale total → LEVEL 3 BLOCK", () => {
  const saleEvent = {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: "neg",
    payload: { client_transaction_id: "neg", total: 10 },
  };
  assert.throws(
    () =>
      applyUfecPostExecutionEnforcement(saleEvent, {
        results: [{ status: "created", transaction: { totalAmount: -5 } }],
      }),
    (e) => e instanceof UfecEnforcementError && e.code === "RECONCILE_REQUIRED"
  );
});

test("buildLedgerComparison exposes enforcementLevel on comparison", () => {
  const event = {
    type: FINANCIAL_EVENT_TYPE.SALE_EVENT,
    clientEventId: "x",
    payload: { client_transaction_id: "x", total: 1 },
  };
  const { comparison } = buildLedgerComparison(event, {
    results: [{ status: "created", transaction: { totalAmount: 1 } }],
  });
  assert.equal(typeof comparison.enforcementLevel, "number");
});
