const { createCircuitBreaker } = require("./circuitBreaker");

/** Outbound calls to Stripe / Paystack (initialize, charge, verify). */
const paymentProviderOutbound = createCircuitBreaker("payment_provider_outbound", {
  failureThreshold: 5,
  resetMs: 30_000,
  halfOpenAfterMs: 10_000,
});

module.exports = { paymentProviderOutbound };
