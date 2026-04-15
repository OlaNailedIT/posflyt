/**
 * Normalize phone to digits-only E.164-style (no +). Nigeria-focused: leading 0 → 234.
 * @param {string} raw
 * @returns {string}
 */
function normalizePhoneDigits(raw) {
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

/**
 * Digits for wa.me links (no + prefix).
 */
function waMePathDigits(normalizedDigits) {
  return normalizedDigits.replace(/^\+/, "");
}

module.exports = { normalizePhoneDigits, waMePathDigits };
