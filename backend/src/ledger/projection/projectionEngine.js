/**
 * Phase 4C — deterministic projection: (priorState, event) → nextState + append-only line intents.
 */
const { roundCurrency } = require("../../utils/paymentState");
const { reduceTransactionFinancialState } = require("./stateReducer");

/**
 * @typedef {object} LedgerLineIntent
 * @property {string} ledgerLineId
 * @property {string} lineKind — matches Prisma `IntegrityLedgerLineKind`
 * @property {number} debit
 * @property {number} credit
 * @property {number} balanceAfter — running recognition (this transaction scope)
 * @property {string} sourceEventId
 */

/**
 * @param {object} previousState
 * @param {object} nextState
 * @param {object} event
 * @returns {LedgerLineIntent[]}
 */
function buildLedgerLineIntents(previousState, nextState, event) {
  if (event.type === "SALE_QUEUED_OFFLINE") {
    return [];
  }

  if (event.type === "SALE_APPLIED") {
    const deltaNet = roundCurrency(nextState.runningNet - previousState.runningNet);
    if (deltaNet <= 0) {
      return [];
    }
    const ledgerLineId = `${event.clientTransactionId}::ledger::SALE::${event.eventId}`;
    return [
      {
        ledgerLineId,
        lineKind: "SALE",
        debit: 0,
        credit: deltaNet,
        balanceAfter: nextState.runningNet,
        sourceEventId: event.eventId,
      },
    ];
  }

  return [];
}

/**
 * Core API: fold one event onto current reduced state and emit idempotent line intents.
 * @param {object} event — IntegrityLedgerEvent row shape
 * @param {object} currentState
 */
function projectEvent(event, currentState) {
  const nextState = reduceTransactionFinancialState(currentState, event);
  const lineIntents = buildLedgerLineIntents(currentState, nextState, event);
  return { nextState, lineIntents };
}

module.exports = {
  projectEvent,
  buildLedgerLineIntents,
};
