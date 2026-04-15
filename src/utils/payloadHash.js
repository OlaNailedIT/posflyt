import { stableStringify } from "./stableStringify";

/**
 * Canonical body for idempotency hash: full transaction payload **excluding** `payload_hash`.
 * @param {Record<string, unknown>} payload
 */
export function stripPayloadHash(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { payload_hash: _omit, ...rest } = /** @type {Record<string, unknown>} */ (payload);
  return rest;
}

/**
 * @param {Record<string, unknown>} payloadWithoutHash
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function computePayloadHashHex(payloadWithoutHash) {
  const s = stableStringify(payloadWithoutHash);
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * @param {Record<string, unknown>} payloadWithOrWithoutHash
 */
export async function attachPayloadHash(payloadWithOrWithoutHash) {
  const base = stripPayloadHash(
    /** @type {Record<string, unknown>} */ (payloadWithOrWithoutHash)
  );
  const payload_hash = await computePayloadHashHex(base);
  return { ...base, payload_hash };
}
