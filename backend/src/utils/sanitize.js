/**
 * Phase 7.2 — input sanitization for stored and displayed user-supplied text.
 * Prisma parameterizes queries (SQL injection mitigated); this targets XSS and control-character abuse.
 */

const HTML_TAG = /<[^>]*>/g;
/** C0 controls except tab/lf/cr */
const CTRL_EXCEPT_WHITESPACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Plain text: strip HTML-like tags, remove null bytes and most control characters, trim, cap length.
 * @param {unknown} input
 * @param {number} [maxLength]
 */
function sanitizePlainText(input, maxLength = 2000) {
  if (input == null) return "";
  let s = String(input).replace(/\u0000/g, "");
  s = s.replace(HTML_TAG, "");
  s = s.replace(CTRL_EXCEPT_WHITESPACE, "");
  s = s.trim();
  if (maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength);
  }
  return s;
}

/** Business or person display names */
function sanitizeDisplayName(input, maxLength = 120) {
  return sanitizePlainText(input, maxLength);
}

/** Short codes: SKU, barcode — alphanumeric plus common separators */
function sanitizeProductCode(input, maxLength = 128) {
  if (input == null || input === "") return input;
  const s = sanitizePlainText(input, maxLength);
  return s.replace(/[^\w\s\-./]/g, "").trim();
}

/** Email: normalize only; format validated by Zod elsewhere */
function normalizeEmail(input) {
  if (input == null || input === "") return input;
  return String(input).trim().toLowerCase().slice(0, 254);
}

module.exports = {
  sanitizePlainText,
  sanitizeDisplayName,
  sanitizeProductCode,
  normalizeEmail,
};
