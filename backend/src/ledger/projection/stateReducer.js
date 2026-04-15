/**
 * Phase 4C — pure (state, event) => nextState for a single clientTransactionId scope.
 */
const { roundCurrency } = require("../../utils/paymentState");
const { TxFinancialStatus } = require("./ledgerConstants");
const {
  readSaleTotal,
  readPaymentRails,
  resolveSalePaymentStatus,
  readTaxDiscount,
} = require("./ledgerRules");

/**
 * @typedef {object} TransactionFinancialState
 * @property {string} transactionId
 * @property {string} status
 * @property {{ gross: number, discount: number, tax: number, net: number }} totals
 * @property {{ cash: number, card: number, transfer: number, mobile: number, credit: number, wallet: number }} payments
 * @property {number} balance — amount still owed (e.g. credit / partial)
 * @property {number} runningNet — cumulative recognized net (for ledger line balanceAfter)
 */

/**
 * @param {string} clientTransactionId
 * @returns {TransactionFinancialState}
 */
function initialTransactionFinancialState(clientTransactionId) {
  return {
    transactionId: clientTransactionId,
    status: TxFinancialStatus.EMPTY,
    totals: { gross: 0, discount: 0, tax: 0, net: 0 },
    payments: { cash: 0, card: 0, transfer: 0, mobile: 0, credit: 0, wallet: 0 },
    balance: 0,
    runningNet: 0,
  };
}

/**
 * @param {TransactionFinancialState} state
 * @param {object} event — IntegrityLedgerEvent row shape (subset)
 * @returns {TransactionFinancialState}
 */
function reduceTransactionFinancialState(state, event) {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? /** @type {Record<string, unknown>} */ (event.payload)
      : {};

  switch (event.type) {
    case "SALE_QUEUED_OFFLINE": {
      return {
        ...state,
        transactionId: event.clientTransactionId,
        status: TxFinancialStatus.PENDING_SYNC,
      };
    }
    case "SALE_APPLIED": {
      const gross = readSaleTotal(payload);
      const { tax, discount } = readTaxDiscount("SALE_APPLIED", payload);
      const net = roundCurrency(Math.max(0, gross - discount));
      const { status, balance } = resolveSalePaymentStatus(payload, net);
      const rails = readPaymentRails(payload, net);

      return {
        ...state,
        transactionId: event.clientTransactionId,
        status,
        totals: { gross, discount, tax, net },
        payments: rails,
        balance: balance < 0 ? 0 : balance,
        runningNet: roundCurrency(state.runningNet + net),
      };
    }
    default:
      return { ...state };
  }
}

module.exports = {
  initialTransactionFinancialState,
  reduceTransactionFinancialState,
};
