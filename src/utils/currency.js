export function formatMoney(amount, currencySymbol = "$") {
  const numeric = Number(amount || 0);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
  return `${currencySymbol}${formatted}`;
}
