/**
 * Phase 7.12.3: WhatsApp deep links (wa.me / click-to-chat) — no server-side WhatsApp API.
 * @param {string} raw — phone as entered (may include +, spaces)
 * @returns {string} digits only
 */
export function digitsForWhatsApp(raw) {
  if (raw == null) return "";
  return String(raw).replace(/\D/g, "");
}

/**
 * Pre-filled body for wa.me / api.whatsapp.com (Phase 7.12.3).
 * @param {string} receiptUrl
 * @returns {string}
 */
export function buildReceiptWhatsAppMessage(receiptUrl) {
  return `Hello 👋\nHere is your receipt: ${receiptUrl}\nThank you for your purchase!`;
}

/**
 * Open chat with a specific number (country code, digits only — no + or spaces).
 * @param {string} phoneDigits — e.g. 15551234567
 * @param {string} receiptUrl
 * @returns {string}
 */
export function buildWhatsAppReceiptUrl(phoneDigits, receiptUrl) {
  const digits = digitsForWhatsApp(phoneDigits);
  const msg = buildReceiptWhatsAppMessage(receiptUrl);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

/**
 * Opens WhatsApp with the same message so the user can pick a contact (no phone in URL).
 * Uses official click-to-chat pattern when no number is supplied.
 * @param {string} receiptUrl
 * @returns {string}
 */
export function buildWhatsAppReceiptUrlChooseContact(receiptUrl) {
  const msg = buildReceiptWhatsAppMessage(receiptUrl);
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
}
