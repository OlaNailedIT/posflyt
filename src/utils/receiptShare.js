/**
 * Share helpers for receipt delivery (WhatsApp uses whatsappReceipt.js).
 * Email uses mailto: — opens the cashier's default mail app; no server SMTP.
 */

const MAILTO_BODY_MAX = 1800;

/**
 * @param {string} email
 * @returns {boolean}
 */
export function looksLikeEmail(email) {
  if (!email || typeof email !== "string") return false;
  const t = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * @param {{ toEmail: string, businessName?: string, receiptUrl?: string, plainLines?: string }} opts
 * @returns {string} mailto href
 */
export function buildReceiptMailtoHref({ toEmail, businessName, receiptUrl, plainLines }) {
  const to = String(toEmail).trim();
  const subject = `Receipt — ${businessName || "Your purchase"}`;
  let body = "";
  if (receiptUrl) {
    body = `Hello,\n\nHere is your receipt link:\n${receiptUrl}\n\nThank you for your purchase!`;
  } else {
    body =
      plainLines && plainLines.trim()
        ? `Hello,\n\n${plainLines.trim()}\n\nThank you for your purchase!`
        : "Hello,\n\nPlease find your purchase details attached or shared separately.\n\nThank you!";
  }
  if (body.length > MAILTO_BODY_MAX) {
    body = `${body.slice(0, MAILTO_BODY_MAX - 30)}\n\n…[message truncated]`;
  }
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
