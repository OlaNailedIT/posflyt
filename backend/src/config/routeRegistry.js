/**
 * Route registry — expected `app.use(prefix, handler)` pairs for the HTTP API surface.
 *
 * When you add or remove a router in `src/app.js`, update this list so CI stays in sync.
 * Pairs are (mount prefix, second argument identifier). Order does not matter for validation.
 *
 * Not listed here: middleware-only `app.use(fn)` (e.g. jsonBodyParser, apiLimiter).
 */

/** @type {Array<[string, string]>} */
const expectedRouterMounts = [
  ["/auth", "authLimiter"],
  ["/auth", "authRoutes"],
  ["/products", "productRoutes"],
  ["/inventory-count", "inventoryCountRoutes"],
  ["/transactions", "transactionRoutes"],
  ["/", "dashboardRoutes"],
  ["/", "systemRoutes"],
  ["/", "settingsRoutes"],
  ["/", "adminRoutes"],
  ["/", "customerRoutes"],
  ["/", "reportRoutes"],
  ["/", "exportRoutes"],
  ["/", "onboardingRoutes"],
  ["/", "analyticsRoutes"],
  ["/", "billingRoutes"],
  ["/", "auditRoutes"],
  ["/", "backupRoutes"],
  ["/", "sessionRoutes"],
  ["/", "supportRoutes"],
  ["/", "staffRoutes"],
  ["/api/admin", "adminApiRoutes"],
  ["/api/bi", "biRoutes"],
  ["/", "usageRoutes"],
  ["/", "marketingRoutes"],
  ["/", "expenseRoutes"],
  ["/api/v1", "eventRoutes"],
  ["/api/v1", "reconciliationRoutes"],
  ["/api/v1", "observabilityRoutes"],
  ["/api/v1", "streamRoutes"],
  ["/api/v1", "chaosRoutes"],
  ["/api/v1", "distributedRoutes"],
  ["/api/auth", "authLimiter"],
  ["/api/auth", "authRoutes"],
  ["/api/products", "productRoutes"],
  ["/api/inventory-count", "inventoryCountRoutes"],
  ["/api/transactions", "transactionRoutes"],
  ["/api", "customerRoutes"],
  ["/api", "settingsRoutes"],
  ["/api", "expenseRoutes"],
  ["/api", "dashboardRoutes"],
  ["/api", "auditRoutes"],
];

/** Dev-only mounts (still present in source; counted when validating app.js text). */
const expectedDevRouterMounts = [["/debug", "debugRoutes"]];

/**
 * Required route files under `src/routes/` that must be required by `app.js` (no orphan routers).
 * @type {string[]}
 */
const requiredRouteModules = [
  "authRoutes",
  "productRoutes",
  "transactionRoutes",
  "dashboardRoutes",
  "settingsRoutes",
  "adminRoutes",
  "customerRoutes",
  "reportRoutes",
  "exportRoutes",
  "onboardingRoutes",
  "analyticsRoutes",
  "billingRoutes",
  "auditRoutes",
  "backupRoutes",
  "sessionRoutes",
  "supportRoutes",
  "systemRoutes",
  "staffRoutes",
  "adminApiRoutes",
  "biRoutes",
  "usageRoutes",
  "marketingRoutes",
  "expenseRoutes",
  "inventoryCountRoutes",
  "eventRoutes",
  "reconciliationRoutes",
  "observabilityRoutes",
  "streamRoutes",
  "chaosRoutes",
  "distributedRoutes",
];

module.exports = {
  expectedRouterMounts,
  expectedDevRouterMounts,
  requiredRouteModules,
};
