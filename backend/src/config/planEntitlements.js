/**
 * Phase 7.5: resource quotas per subscription tier (server-enforced).
 * Feature flags live in `FeatureFlag` (DB); these numbers stay in code unless overridden later.
 */
const SOFT_QUOTA_RATIO = 0.8;

/** Monthly / static caps by plan. */
const PLAN_QUOTAS = {
  FREE: {
    transactionsPerMonth: 500,
    customers: 200,
    apiRequestsPerMonth: 5_000,
  },
  BASIC: {
    transactionsPerMonth: 15_000,
    customers: 5_000,
    apiRequestsPerMonth: 100_000,
  },
  PREMIUM: {
    transactionsPerMonth: 500_000,
    customers: 500_000,
    apiRequestsPerMonth: 1_000_000,
  },
};

/** Defaults when `FeatureFlag` rows are missing (e.g. before seed migration). */
const DEFAULT_FEATURE_FLAGS = {
  REPORTING: { FREE: false, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  BI_DASHBOARD: { FREE: false, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  CSV_EXPORT: { FREE: false, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  ADVANCED_ANALYTICS: { FREE: false, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  STAFF_ANALYTICS: { FREE: false, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  API_INTEGRATIONS: { FREE: false, BASIC: false, PREMIUM: true, abRolloutPercent: null },
  /** Credit / partial payment sales and customer outstanding balance (Phase 7.10.1). */
  CREDIT_SALES: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Simple expense tracking; profit is derived (sales − expenses) (Phase 7.10.2). */
  EXPENSES: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Daily profit summary (sales − expenses); derived, no extra storage (Phase 7.10.3). */
  DAILY_PROFIT_SUMMARY: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Weight / volume products (kg, litre); fractional qty & stock (Phase 7.11.1). */
  WEIGHTED_PRODUCTS: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Single-screen fast checkout (Phase 7.11.2). */
  QUICK_SALES_MODE: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Low stock threshold + dashboard alerts + observability (Phase 7.11.3). */
  LOW_STOCK_ALERTS: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Barcode-first physical inventory count (Phase 7.11.4). */
  INVENTORY_COUNT_MODE: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** PDF receipt + shareable link (Phase 7.12.1). */
  RECEIPT_GENERATOR: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** WhatsApp wa.me deep link for sharing receipt URL (Phase 7.12.2). */
  WHATSAPP_RECEIPT: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
  /** Owner daily metrics via WhatsApp deep link (Phase 7.12.4). */
  DAILY_SUMMARY_OWNER: { FREE: true, BASIC: true, PREMIUM: true, abRolloutPercent: null },
};

module.exports = {
  SOFT_QUOTA_RATIO,
  PLAN_QUOTAS,
  DEFAULT_FEATURE_FLAGS,
};
