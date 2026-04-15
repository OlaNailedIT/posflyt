/**
 * Phase 4C — bounded transaction-level financial state (integrity projection, not full GL).
 * @readonly
 */
const TxFinancialStatus = {
  EMPTY: "EMPTY",
  PENDING_SYNC: "PENDING_SYNC",
  PAID: "PAID",
  PARTIAL: "PARTIAL",
  CREDIT_OPEN: "CREDIT_OPEN",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

module.exports = { TxFinancialStatus };
