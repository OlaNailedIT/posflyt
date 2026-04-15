import { stableStringify } from "../utils/stableStringify.js";

/**
 * Deterministic content hash for integrity events (excludes `hash` field).
 * @param {Record<string, unknown>} record
 */
export async function hashIntegrityRecord(record) {
  const { hash: _omit, ...rest } = record;
  const s = stableStringify(rest);
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
