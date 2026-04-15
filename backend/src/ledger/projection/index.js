/**
 * Phase 4C integrity ledger projection (deterministic financial state machine).
 */
const { TxFinancialStatus } = require("./ledgerConstants");
const { sortIntegrityEvents, rebuildFinancialState, rebuildBalance, compareIntegrityEvents } = require("./balanceEngine");
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("./stateReducer");
const { projectEvent, buildLedgerLineIntents } = require("./projectionEngine");

module.exports = {
  TxFinancialStatus,
  sortIntegrityEvents,
  rebuildFinancialState,
  rebuildBalance,
  compareIntegrityEvents,
  initialTransactionFinancialState,
  reduceTransactionFinancialState,
  projectEvent,
  buildLedgerLineIntents,
};
