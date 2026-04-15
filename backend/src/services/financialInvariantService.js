/**
 * Server-side financial invariant checks (UFEC adapter layer).
 * Complements client UFEC: blocks impossible states before persistence; flags soft drift for audit.
 */

const { roundCurrency } = require("../utils/paymentState");

const MONEY_EPS = 0.005;

/**
 * Max absolute drift (major units) we may absorb on split tender after last-line correction.
 * Mirrors splitPayments soft band: minor client rounding → corrected + FLAG, not silent corruption.
 */
function softDriftBandMax(totalAmount) {
  const t = roundCurrency(Number(totalAmount));
  return Math.max(5, roundCurrency(t * 0.002));
}

/**
 * @param {object} input
 * @param {number} input.totalAmount
 * @param {number} input.amountPaid
 * @param {number} input.balanceDue
 * @param {{ type: string, amount: number }[]|null|undefined} input.splitPayments
 * @param {boolean} [input.softDriftAdjusted]
 * @param {"SALE"|"RETURN"} [input.transactionType]
 * @param {string|null|undefined} [input.originalTransactionId]
 * @returns {{ blockCodes: string[], flagCodes: string[] }}
 */
function validateTransactionInvariants(input) {
  const blockCodes = [];
  const flagCodes = [];

  const totalAmount = roundCurrency(Number(input.totalAmount));
  const amountPaid = roundCurrency(Number(input.amountPaid));
  const balanceDue = roundCurrency(Number(input.balanceDue));

  if (!Number.isFinite(totalAmount) || !Number.isFinite(amountPaid) || !Number.isFinite(balanceDue)) {
    blockCodes.push("NON_FINITE_MONEY");
    return { blockCodes, flagCodes };
  }

  const txType = input.transactionType || "SALE";

  if (txType === "SALE" && totalAmount < 0) {
    blockCodes.push("NEGATIVE_TOTAL");
  }

  if (txType === "SALE" && (amountPaid < -MONEY_EPS || balanceDue < -MONEY_EPS)) {
    blockCodes.push("NEGATIVE_PAYMENT");
  }

  const pairSum = roundCurrency(amountPaid + balanceDue);
  if (Math.abs(pairSum - totalAmount) >= MONEY_EPS) {
    blockCodes.push("PAYMENT_MISMATCH");
  }

  const split = input.splitPayments;
  if (Array.isArray(split) && split.length > 0) {
    let sum = 0;
    for (const p of split) {
      const a = roundCurrency(Number(p.amount));
      if (!Number.isFinite(a) || a < -MONEY_EPS) {
        blockCodes.push("INVALID_SPLIT_LINE");
        break;
      }
      sum = roundCurrency(sum + a);
    }
    const d = Math.abs(roundCurrency(sum - totalAmount));
    if (d >= MONEY_EPS) {
      blockCodes.push("PAYMENT_MISMATCH");
    }
  }

  if (txType === "RETURN") {
    const orig = input.originalTransactionId;
    if (orig == null || String(orig).trim() === "") {
      blockCodes.push("MISSING_ORIGINAL_TRANSACTION");
    }
  }

  if (input.softDriftAdjusted) {
    flagCodes.push("PAYMENT_DRIFT_CORRECTED");
  }

  return { blockCodes, flagCodes };
}

/**
 * @param {{ blockCodes: string[], flagCodes: string[] }} inv
 * @returns {{ level: number, action: "ALLOW" | "FLAG" | "BLOCK", blockCodes: string[], flagCodes: string[] }}
 */
function evaluateInvariantResult(inv) {
  const blockCodes = inv.blockCodes || [];
  const flagCodes = inv.flagCodes || [];

  if (blockCodes.length > 0) {
    return { level: 3, action: "BLOCK", blockCodes, flagCodes };
  }
  if (flagCodes.length > 0) {
    return { level: 2, action: "FLAG", blockCodes, flagCodes };
  }
  return { level: 0, action: "ALLOW", blockCodes, flagCodes };
}

/**
 * Double-entry style check: sum(debits) === sum(credits).
 * @param {{ debit?: number, credit?: number }[]} entries
 * @returns {{ balanced: boolean, debitSum: number, creditSum: number, drift: number }}
 */
function assertLedgerBalanced(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { balanced: true, debitSum: 0, creditSum: 0, drift: 0 };
  }
  let debitSum = 0;
  let creditSum = 0;
  for (const row of entries) {
    debitSum = roundCurrency(debitSum + Number(row.debit || 0));
    creditSum = roundCurrency(creditSum + Number(row.credit || 0));
  }
  const drift = Math.abs(roundCurrency(debitSum - creditSum));
  return {
    balanced: drift < MONEY_EPS,
    debitSum,
    creditSum,
    drift,
  };
}

module.exports = {
  MONEY_EPS,
  softDriftBandMax,
  validateTransactionInvariants,
  evaluateInvariantResult,
  assertLedgerBalanced,
};
