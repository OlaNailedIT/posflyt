/**
 * Phase 7.11.3: low-stock rule — stock <= threshold when threshold is set and positive.
 * Null, non-finite, or ≤0 threshold means this product does not participate in alerts.
 */
function isLowStockCondition(stock, threshold) {
  if (threshold == null) return false;
  const t = Number(threshold);
  if (!Number.isFinite(t) || t <= 0) return false;
  return Number(stock) <= t;
}

module.exports = { isLowStockCondition };
