/**
 * Phase 4C — payload interpretation per integrity event type (pure helpers).
 */
const { roundCurrency } = require("../../utils/paymentState");
const { TxFinancialStatus } = require("./ledgerConstants");

/**
 * @param {Record<string, unknown>} payload
 * @returns {number}
 */
function readSaleTotal(payload) {
  const raw = payload.totalAmount ?? payload.total;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return roundCurrency(Math.max(0, n));
}

/**
 * Best-effort payment rails split from a single sale payload (POS / UFEC body shapes).
 * @param {Record<string, unknown>} payload
 * @param {number} total
 * @returns {{ cash: number, card: number, transfer: number, mobile: number, credit: number, wallet: number }}
 */
function readPaymentRails(payload, total) {
  const out = { cash: 0, card: 0, transfer: 0, mobile: 0, credit: 0, wallet: 0 };
  const method = String(payload.payment_method || "").toUpperCase();
  const ps = String(payload.payment_status || "paid").toLowerCase();

  if (Array.isArray(payload.payments)) {
    for (const row of payload.payments) {
      if (!row || typeof row !== "object") continue;
      const amt = roundCurrency(Number(row.amount));
      const t = String(row.type || "").toUpperCase();
      if (t === "CASH") out.cash += amt;
      else if (t === "CARD") out.card += amt;
      else if (t === "TRANSFER") out.transfer += amt;
      else if (t === "MOBILE") out.mobile += amt;
    }
    return out;
  }

  if (ps === "credit") {
    out.credit = total;
    return out;
  }

  const t = roundCurrency(total);
  if (method === "CARD") out.card = t;
  else if (method === "TRANSFER") out.transfer = t;
  else if (method === "MOBILE") out.mobile = t;
  else if (method === "CREDIT") out.credit = t;
  else out.cash = t;

  return out;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {number} total
 * @returns {{ status: string, balance: number }}
 */
function resolveSalePaymentStatus(payload, total) {
  const ps = String(payload.payment_status || "paid").toLowerCase();
  if (ps === "credit") {
    return { status: TxFinancialStatus.CREDIT_OPEN, balance: total };
  }
  if (ps === "partial") {
    const paid = roundCurrency(payload.amount_paid ?? 0);
    return { status: TxFinancialStatus.PARTIAL, balance: roundCurrency(total - paid) };
  }
  return { status: TxFinancialStatus.PAID, balance: 0 };
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {{ tax: number, discount: number }}
 */
function readTaxDiscount(type, payload) {
  if (type !== "SALE_APPLIED") return { tax: 0, discount: 0 };
  const tax = payload.taxAmount != null ? roundCurrency(Number(payload.taxAmount)) : 0;
  const discount = payload.discountAmount != null ? roundCurrency(Number(payload.discountAmount)) : 0;
  const safeTax = Number.isFinite(tax) ? Math.max(0, tax) : 0;
  const safeDisc = Number.isFinite(discount) ? Math.max(0, discount) : 0;
  return { tax: safeTax, discount: safeDisc };
}

module.exports = {
  readSaleTotal,
  readPaymentRails,
  resolveSalePaymentStatus,
  readTaxDiscount,
};
