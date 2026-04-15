/**
 * Structured checkout / reconciliation events for analytics, support, and fraud review.
 * Logs JSON in production (one line) for log pipelines; readable in dev.
 */

function shortId(id) {
  if (id == null || typeof id !== "string") return null;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
export function emitCheckoutTelemetry(event, payload = {}) {
  const row = {
    domain: "checkout",
    event,
    ts: new Date().toISOString(),
    ...payload,
  };
  if (import.meta.env.DEV) {
    console.info("[CHECKOUT]", row);
  } else {
    console.info(JSON.stringify(row));
  }
}

export { shortId };
