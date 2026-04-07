/** Shared SaaS plan pricing (USD) for checkout and retries. */
const PLAN_PRICING = {
  FREE: 0,
  BASIC: 29,
  PREMIUM: 99,
};

function getPlanCurrency(plan) {
  return plan === "BASIC" || plan === "PREMIUM" ? "USD" : "USD";
}

module.exports = { PLAN_PRICING, getPlanCurrency };
