export function resolveTaxRate(settings) {
  const rules = Array.isArray(settings?.taxRules) ? settings.taxRules : [];
  const countryCode = settings?.countryCode || "US";
  const matched = rules.find((rule) => rule.countryCode === countryCode);
  if (matched?.enabled) return Number(matched.rate || 0);
  if (settings?.taxEnabled) return Number(settings.taxRate || 0);
  return 0;
}

export function calculateTaxTotal(subtotal, settings) {
  const rate = resolveTaxRate(settings);
  return {
    rate,
    taxAmount: (Number(subtotal || 0) * rate) / 100,
  };
}
