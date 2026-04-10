import { formatMoney } from "./currency";
import { digitsForWhatsApp } from "./whatsappReceipt";

/**
 * Phase 7.12.4: text block for owner daily summary (WhatsApp / SMS).
 * @param {{ totalSales: number, transactions: number, topItemName: string }} summary
 * @param {string} currencySymbol
 */
export function formatOwnerDailySummaryMessage(summary, currencySymbol) {
  const salesLine = formatMoney(summary.totalSales ?? 0, currencySymbol);
  return `📊 Today:\nSales: ${salesLine}\nTransactions: ${summary.transactions ?? 0}\nTop item: ${summary.topItemName ?? "None"}`;
}

/** @returns {string | null} */
export function buildOwnerDailySummaryWhatsAppUrl(phoneDigits, message) {
  const d = digitsForWhatsApp(phoneDigits);
  if (d.length < 8 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}

export function buildOwnerDailySummaryWhatsAppChooseContact(message) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}
