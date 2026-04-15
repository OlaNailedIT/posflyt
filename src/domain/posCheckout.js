import { safeToISOString } from "../utils/safeDate";

/**
 * Shared POS transaction payload builder (standard + quick sales).
 * @param {object} opts
 * @param {string} [opts.defaultPaymentMethod='CASH'] — when not using split payments / credit
 * @param {'standard'|'quick'} [opts.checkoutSource]
 * @param {number} [opts.clientDurationMs] — optional client-measured checkout duration for metrics
 */
export function buildCheckoutPayload({
  items,
  total,
  clientTransactionId,
  customerId,
  createdAt,
  creditMode,
  creditOption,
  amountPaid,
  dueDate,
  eventId,
  splitPayments,
  defaultPaymentMethod = "CASH",
  checkoutSource,
  clientDurationMs,
}) {
  const base = {
    client_transaction_id: clientTransactionId,
    created_at: createdAt,
    customer_id: customerId || undefined,
    items: items.map((item) => ({
      product_id: item.id,
      quantity: item.quantity,
    })),
    total,
    ...(eventId ? { event_id: eventId } : {}),
    ...(checkoutSource ? { checkout_source: checkoutSource } : {}),
    ...(clientDurationMs != null && Number.isFinite(Number(clientDurationMs))
      ? { client_duration_ms: Math.round(Number(clientDurationMs)) }
      : {}),
  };
  if (!creditMode && splitPayments?.length) {
    return {
      ...base,
      payment_status: "paid",
      payments: splitPayments,
    };
  }
  if (!creditMode) {
    return { ...base, payment_method: defaultPaymentMethod };
  }

  if (creditOption === "full") {
    return { ...base, payment_status: "paid", payment_method: "CASH" };
  }
  if (creditOption === "partial") {
    return {
      ...base,
      payment_status: "partial",
      payment_method: "CASH",
      amount_paid: Number(amountPaid),
    };
  }
  if (creditOption === "credit") {
    const out = {
      ...base,
      payment_status: "credit",
      payment_method: "CREDIT",
    };
    if (dueDate) {
      const dueIso = safeToISOString(dueDate);
      if (dueIso) out.due_date = dueIso;
    }
    return out;
  }
  return base;
}
