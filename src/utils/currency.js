/** Align with backend `roundCurrency` for split-payment totals. */
export function roundCurrency(value, decimalPlaces = 2) {
  const dp = Math.max(0, Math.min(18, Math.floor(Number(decimalPlaces))));
  const f = 10 ** dp;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}

export function formatMoney(amount, currencySymbol = "$") {
  const numeric = Number(amount || 0);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
  return `${currencySymbol}${formatted}`;
}
