import { stableStringify } from "../utils/stableStringify";

/**
 * Fingerprint of sale intent (cart + payment shape) for sticky session reuse — excludes client_transaction_id.
 * @param {object} snap — POS or quick snapshot from checkoutSnapshot.js
 */
export function intentFingerprintFromSnapshot(snap) {
  const lines = (snap.lines || []).map((l) => ({
    id: l.id,
    quantity: l.quantity,
    unitType: l.unitType || "unit",
  }));
  const base = {
    kind: snap.kind || "pos",
    lines,
    total: Number(snap.total),
    customerId: snap.customerId || null,
    creditMode: Boolean(snap.creditMode),
    creditOption: snap.creditOption || "full",
    amountPaidPartial: snap.amountPaidPartial ?? null,
    dueDate: snap.dueDate || null,
    splitPayments: snap.splitPayments || null,
    defaultPaymentMethod: snap.defaultPaymentMethod || null,
  };
  return stableStringify(base);
}
