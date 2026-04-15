/**
 * Normalize phone to digits-only (E.164-style without +). Leading 0 → 234 for NG-style input.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePhoneDigits(raw) {
  if (raw == null) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("0") && d.length >= 10) {
    d = `234${d.slice(1)}`;
  }
  if (d.length < 10 || d.length > 15) {
    return "";
  }
  return d;
}
