/**
 * Localized tier pricing (NGN / ZAR). Display strings use psychological anchors where noted.
 */
export const CURRENCY = {
  NGN: { code: "NGN", symbol: "₦", label: "Nigeria (NGN)" },
  ZAR: { code: "ZAR", symbol: "R", label: "South Africa (ZAR)" },
};

/** @type {Array<{ id: string, name: string, details: string, ngn: { display: string }, zar: { display: string } }>} */
export const PRICING_TIERS = [
  {
    id: "lite",
    name: "Lite",
    details: "Single store, core POS + inventory",
    ngn: { display: "₦3,500" },
    zar: { display: "R150" },
  },
  {
    id: "standard",
    name: "Standard",
    details: "Multi-counter, staff roles, reports",
    ngn: { display: "₦9,900" },
    zar: { display: "R449" },
  },
  {
    id: "pro",
    name: "Pro",
    details: "Advanced analytics, priority sync, backups",
    ngn: { display: "₦24,900" },
    zar: { display: "R949" },
  },
];

export function inferRegionFromNavigator() {
  if (typeof navigator === "undefined" || !navigator.language) return null;
  const lang = navigator.language.toLowerCase();
  if (lang.includes("za") || lang === "en-za") return "za";
  if (lang.includes("ng") || lang === "en-ng") return "ng";
  return null;
}
