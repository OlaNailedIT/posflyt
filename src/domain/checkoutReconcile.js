import { getTransactionByClientId } from "../services/api";
import { emitCheckoutTelemetry, shortId } from "../utils/checkoutTelemetry";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential-style delays before each GET attempt (not final truth until exhausted). */
const DEFAULT_DELAYS_MS = [1000, 2000, 4000, 8000];

/**
 * Single GET — for manual “Check transaction status” (no backoff).
 * @param {string} clientTransactionId
 * @returns {Promise<object|null>} transaction or null
 */
export async function fetchTransactionStatusOnce(clientTransactionId) {
  try {
    const body = await getTransactionByClientId(clientTransactionId);
    if (body?.transaction?.id) return body.transaction;
  } catch (e) {
    const st = e?.response?.status;
    if (st === 404) return null;
    throw e;
  }
  return null;
}

/**
 * Poll server truth after ambiguous POST / timeout / parse failure.
 * @param {string} clientTransactionId
 * @param {{ delaysMs?: number[] }} [options]
 * @returns {Promise<object|null>} mapped transaction or null
 */
export async function reconcileTransactionWithBackoff(clientTransactionId, options = {}) {
  const delaysMs = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const sid = shortId(clientTransactionId);
  emitCheckoutTelemetry("CHECKOUT_RECONCILE_START", { clientTransactionId: sid });
  for (let i = 0; i < delaysMs.length; i += 1) {
    await sleep(delaysMs[i]);
    try {
      const body = await getTransactionByClientId(clientTransactionId);
      if (body?.transaction?.id) {
        emitCheckoutTelemetry("CHECKOUT_RECONCILE_SUCCESS", { clientTransactionId: sid, attempt: i + 1 });
        return body.transaction;
      }
    } catch (e) {
      const st = e?.response?.status;
      if (st === 404) continue;
      if (st == null || st >= 500) continue;
      if (st === 401 || st === 403) break;
    }
  }
  emitCheckoutTelemetry("CHECKOUT_RECONCILE_TIMEOUT", { clientTransactionId: sid, attempts: delaysMs.length });
  return null;
}
