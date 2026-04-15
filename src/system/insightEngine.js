/**
 * Lightweight business insights from a daily profit summary (owner API or dashboard stats shape).
 * @param {object | null | undefined} summary
 * @returns {string[]}
 */
export function generateInsights(summary) {
  const insights = [];
  if (!summary || typeof summary !== "object") return insights;

  const grossProfit = Number(summary.grossProfit ?? 0);
  const expenses = Number(summary.totalExpenses ?? summary.expenses ?? 0);
  const netProfit = Number(summary.netProfit ?? summary.dailyProfit ?? summary.profit ?? 0);

  if (netProfit > 0) {
    insights.push("You made net profit today.");
  } else if (netProfit < 0) {
    insights.push("You are running at a net loss today.");
  }

  if (expenses > 0 && expenses > grossProfit) {
    insights.push("Expenses are higher than gross profit today — review cost control.");
  } else if (netProfit > 0 && expenses > 0 && grossProfit > 0 && expenses / grossProfit > 0.4) {
    insights.push("Expenses are taking a large share of gross profit.");
  }

  return insights;
}
