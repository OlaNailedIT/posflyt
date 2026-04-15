/**
 * Active cart → immutable transaction snapshot at checkout initiation.
 * Checkout must not depend on cart state after capture (lines are deep-copied).
 */
import { roundCurrency } from "../utils/currency";
import { buildCheckoutPayload } from "./posCheckout";

/** Placeholders for intent fingerprint pre-pass (ids excluded from intent hash). */
export const CHECKOUT_INTENT_PLACEHOLDER_TX_ID = "00000000-0000-4000-8000-000000000001";
export const CHECKOUT_INTENT_PLACEHOLDER_EVENT_ID = "00000000-0000-4000-8000-000000000002";

/**
 * @param {Array<{id: string, name: string, unitPrice: number, quantity: number, unitType?: string}>} items
 */
function cloneLines(items) {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    unitPrice: Number(i.unitPrice),
    quantity: Number(i.quantity),
    unitType: i.unitType || "unit",
  }));
}

/**
 * Full POS checkout snapshot (credit, split, etc.).
 * @param {string} clientTransactionId — sticky session id (=== client_transaction_id)
 * @param {string} eventId — stable for retries (=== event_id)
 */
export function capturePosCheckoutSnapshot({
  clientTransactionId,
  eventId,
  items,
  total,
  selectedCustomerId,
  useCredit,
  creditOption,
  partialAmountInput,
  dueDateInput,
  splitPaymentEnabled,
  splitLines,
}) {
  const createdAtIso = new Date().toISOString();
  const lines = cloneLines(items);

  let splitPayments;
  if (splitPaymentEnabled && !useCredit) {
    splitPayments = splitLines
      .map((l) => ({ type: l.type, amount: roundCurrency(Number(l.amount)) }))
      .filter((l) => l.amount > 0);
  }

  return {
    kind: "pos",
    lines,
    total: Number(total),
    clientTransactionId,
    eventId,
    createdAtIso,
    customerId: selectedCustomerId || "",
    creditMode: Boolean(useCredit),
    creditOption: useCredit ? creditOption : "full",
    amountPaidPartial: useCredit && creditOption === "partial" ? Number(partialAmountInput) : undefined,
    dueDate: useCredit && creditOption === "credit" ? dueDateInput : undefined,
    splitPayments,
  };
}

/**
 * Quick sale snapshot (simple paid sale).
 */
export function captureQuickCheckoutSnapshot({
  clientTransactionId,
  eventId,
  items,
  total,
  paymentMethod,
  clientDurationMs,
}) {
  const createdAtIso = new Date().toISOString();
  const lines = cloneLines(items);

  return {
    kind: "quick",
    lines,
    total: Number(total),
    clientTransactionId,
    eventId,
    createdAtIso,
    defaultPaymentMethod: paymentMethod,
    checkoutSource: "quick",
    clientDurationMs: clientDurationMs != null ? Math.round(Number(clientDurationMs)) : undefined,
  };
}

/** API body from frozen POS snapshot (cart already cleared). */
export function buildPayloadFromPosSnapshot(snap) {
  return buildCheckoutPayload({
    items: snap.lines,
    total: snap.total,
    clientTransactionId: snap.clientTransactionId,
    customerId: snap.customerId || undefined,
    createdAt: snap.createdAtIso,
    creditMode: snap.creditMode,
    creditOption: snap.creditOption,
    amountPaid: snap.amountPaidPartial,
    dueDate: snap.dueDate,
    eventId: snap.eventId,
    splitPayments: snap.splitPayments,
  });
}

/** API body from frozen Quick sale snapshot. */
export function buildPayloadFromQuickSnapshot(snap) {
  return buildCheckoutPayload({
    items: snap.lines,
    total: snap.total,
    clientTransactionId: snap.clientTransactionId,
    customerId: undefined,
    createdAt: snap.createdAtIso,
    creditMode: false,
    creditOption: "full",
    eventId: snap.eventId,
    splitPayments: undefined,
    defaultPaymentMethod: snap.defaultPaymentMethod,
    checkoutSource: "quick",
    clientDurationMs: snap.clientDurationMs,
  });
}

