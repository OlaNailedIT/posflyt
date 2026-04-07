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
};

module.exports = {
  SOFT_QUOTA_RATIO,
  PLAN_QUOTAS,
  DEFAULT_FEATURE_FLAGS,
};
