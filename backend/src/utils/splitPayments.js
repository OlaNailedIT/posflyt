const { roundCurrency, computePaymentState } = require("./paymentState");

/** Allowed methods for split tender (not CREDIT — credit is a sale mode, not a tender line). */
const SPLIT_TENDER_TYPES = new Set(["CASH", "CARD", "TRANSFER", "MOBILE"]);

function maxSoftSplitDrift(totalAmount) {
  const t = roundCurrency(Number(totalAmount));
  return Math.max(5, roundCurrency(t * 0.002));
}

/**
 * When `payload.payments` is present, validate split tender lines and return normalized rows.
 * Sum of amounts must equal `totalAmount` (rounded). Only full paid sales; no partial/credit.
 * @returns {null | { payments: { type: string, amount: number }[], paymentMethod: string, amountPaid: number, balanceDue: number, paymentStatus: string }}
 */
function parseSplitPayments(payload, totalAmount, location) {
  if (payload.payments == null) return null;
  if (!Array.isArray(payload.payments)) {
    const err = new Error("payments must be an array");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    err.location = location;
    throw err;
  }
  if (payload.payments.length === 0) {
    const err = new Error("payments array cannot be empty when provided");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    err.location = location;
    throw err;
  }

  const paymentStatusRaw = String(payload.payment_status || "paid").toLowerCase();
  if (paymentStatusRaw !== "paid") {
    const err = new Error("Split payments are only allowed for fully paid sales");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    err.location = location;
    throw err;
  }

  const normalized = [];
  for (const p of payload.payments) {
    const type = String(p.type ?? p.payment_type ?? "").toUpperCase();
    if (!SPLIT_TENDER_TYPES.has(type)) {
      const err = new Error(`Invalid split payment type: ${type}`);
      err.statusCode = 400;
      err.code = "VALIDATION_FAILED";
      err.location = location;
      throw err;
    }
    const amount = roundCurrency(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error("Each split payment amount must be a positive number");
      err.statusCode = 400;
      err.code = "VALIDATION_FAILED";
      err.location = location;
      throw err;
    }
    normalized.push({ type, amount });
  }

  const target = roundCurrency(Number(totalAmount));
  let sum = roundCurrency(normalized.reduce((s, x) => s + x.amount, 0));
  let diff = Math.abs(sum - target);
  let softDriftAdjusted = false;

  if (diff < 0.005) {
    // exact enough after rounding
  } else {
    const softMax = maxSoftSplitDrift(target);
    if (diff <= softMax && normalized.length > 0) {
      const last = normalized[normalized.length - 1];
      const delta = roundCurrency(target - sum);
      const nextLast = roundCurrency(last.amount + delta);
      if (nextLast > 0) {
        last.amount = nextLast;
        sum = roundCurrency(normalized.reduce((s, x) => s + x.amount, 0));
        diff = Math.abs(sum - target);
        softDriftAdjusted = true;
      }
    }
    if (diff >= 0.005) {
      const err = new Error("payments amounts must sum to the sale total");
      err.statusCode = 400;
      err.code = "PAYMENT_SPLIT_MISMATCH";
      err.location = location;
      throw err;
    }
  }

  const state = computePaymentState(target, sum);
  const paymentMethod = normalized.length > 1 ? "MULTI" : normalized[0].type;

  return {
    payments: normalized,
    paymentMethod,
    amountPaid: state.amountPaid,
    balanceDue: state.balanceDue,
    paymentStatus: state.paymentStatus,
    softDriftAdjusted,
  };
}

module.exports = { parseSplitPayments, SPLIT_TENDER_TYPES, maxSoftSplitDrift };
