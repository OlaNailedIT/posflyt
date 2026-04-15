/**
 * Single source of truth for sale amountPaid / balanceDue / paymentStatus (Phase 7.10.1).
 * @param {number} total - authoritative sale total
 * @param {number} paid - amount collected toward the sale
 */
/**
 * Money invariant: always round to a fixed decimal precision before storage or math.
 * Default 2 decimal places (major units — e.g. naira). Prevents float drift in totals.
 * Future upgrade: store minor units as integer (e.g. amountInKobo) for reconciliation.
 * @param {number|string} value
 * @param {number} [decimalPlaces=2]
 */
function roundCurrency(value, decimalPlaces = 2) {
  const dp = Math.max(0, Math.min(18, Math.floor(Number(decimalPlaces))));
  const f = 10 ** dp;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}

function computePaymentState(total, paid) {
  const totalNum = roundCurrency(Number(total));
  const paidRaw = Number(paid);
  if (!Number.isFinite(paidRaw) || !Number.isFinite(totalNum)) {
    const err = new Error("INVALID_PAYMENT_AMOUNT");
    err.statusCode = 400;
    err.code = "INVALID_PAYMENT_AMOUNT";
    throw err;
  }

  if (totalNum <= 0) {
    return {
      amountPaid: 0,
      balanceDue: 0,
      paymentStatus: "PAID",
    };
  }

  const safePaid = Math.max(0, Math.min(paidRaw, totalNum));
  const balanceDue = roundCurrency(totalNum - safePaid);

  let paymentStatus = "PAID";
  if (safePaid === 0) {
    paymentStatus = "CREDIT";
  } else if (balanceDue > 0) {
    paymentStatus = "PARTIAL";
  } else {
    paymentStatus = "PAID";
  }

  return {
    amountPaid: roundCurrency(safePaid),
    balanceDue,
    paymentStatus,
  };
}

/** API / receipt: lowercase for clients */
function paymentStatusToApi(status) {
  if (!status) return "paid";
  return String(status).toLowerCase();
}

/**
 * Guard against drift between totalAmount, amountPaid, and balanceDue (rounded cents).
 */
function assertConsistentPaymentState(totalAmount, amountPaid, balanceDue) {
  const t = roundCurrency(Number(totalAmount));
  const a = roundCurrency(Number(amountPaid));
  const b = roundCurrency(Number(balanceDue));
  const expected = roundCurrency(t - a);
  if (Math.abs(b - expected) >= 0.005) {
    const err = new Error("INCONSISTENT_PAYMENT_STATE");
    err.statusCode = 500;
    err.code = "INCONSISTENT_PAYMENT_STATE";
    throw err;
  }
}

module.exports = {
  computePaymentState,
  roundCurrency,
  paymentStatusToApi,
  assertConsistentPaymentState,
};
