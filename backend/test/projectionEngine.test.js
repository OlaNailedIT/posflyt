const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sortIntegrityEvents, compareIntegrityEvents, rebuildFinancialState } = require("../src/ledger/projection/balanceEngine");
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("../src/ledger/projection/stateReducer");
const { projectEvent, buildLedgerLineIntents } = require("../src/ledger/projection/projectionEngine");
const { TxFinancialStatus } = require("../src/ledger/projection/ledgerConstants");

test("compareIntegrityEvents is total order (timestamp then eventId)", () => {
  const a = {
    eventId: "b",
    clientTransactionId: "tx",
    createdAt: new Date(1000),
    clientTimestampMs: 1000n,
    payload: {},
    type: "SALE_APPLIED",
  };
  const b = {
    eventId: "a",
    clientTransactionId: "tx",
    createdAt: new Date(1000),
    clientTimestampMs: 1000n,
    payload: {},
    type: "SALE_APPLIED",
  };
  assert.ok(compareIntegrityEvents(b, a) < 0);
});

test("SALE_QUEUED_OFFLINE then SALE_APPLIED yields PAID state and one SALE line intent", () => {
  const tx = "client-tx-1";
  const ev1 = {
    eventId: `${tx}:Q`,
    clientTransactionId: tx,
    type: "SALE_QUEUED_OFFLINE",
    payload: {},
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    clientTimestampMs: 1n,
  };
  const ev2 = {
    eventId: `${tx}:A`,
    clientTransactionId: tx,
    type: "SALE_APPLIED",
    payload: { total: 10, payment_status: "paid", payment_method: "CASH" },
    createdAt: new Date("2020-01-01T00:00:01.000Z"),
    clientTimestampMs: 2n,
  };
  const sorted = sortIntegrityEvents([ev2, ev1]);
  const state = rebuildFinancialState(sorted);
  assert.equal(state.status, TxFinancialStatus.PAID);
  assert.equal(state.runningNet, 10);
  assert.equal(state.totals.net, 10);

  let s = initialTransactionFinancialState(tx);
  s = reduceTransactionFinancialState(s, ev1);
  const { lineIntents } = projectEvent(ev2, s);
  assert.equal(lineIntents.length, 1);
  assert.equal(lineIntents[0].credit, 10);
  assert.equal(lineIntents[0].lineKind, "SALE");
});

test("buildLedgerLineIntents is empty for queued-only stream", () => {
  const tx = "t2";
  const ev = {
    eventId: "q1",
    clientTransactionId: tx,
    type: "SALE_QUEUED_OFFLINE",
    payload: {},
    createdAt: new Date(),
    clientTimestampMs: 5n,
  };
  const prior = initialTransactionFinancialState(tx);
  const afterQ = reduceTransactionFinancialState(prior, ev);
  const lines = buildLedgerLineIntents(prior, afterQ, ev);
  assert.equal(lines.length, 0);
});
