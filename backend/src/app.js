const { nodeEnv, trustProxy } = require("./config/env");
const express = require("express");
const pinoHttp = require("pino-http");
const { setupGateway } = require("./gateway/setupGateway");

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const reportRoutes = require("./routes/reportRoutes");
const exportRoutes = require("./routes/exportRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const billingRoutes = require("./routes/billingRoutes");
const auditRoutes = require("./routes/auditRoutes");
const backupRoutes = require("./routes/backupRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const supportRoutes = require("./routes/supportRoutes");
const systemRoutes = require("./routes/systemRoutes");
const staffRoutes = require("./routes/staffRoutes");
const adminApiRoutes = require("./routes/adminApiRoutes");
const biRoutes = require("./routes/biRoutes");
const usageRoutes = require("./routes/usageRoutes");
const marketingRoutes = require("./routes/marketingRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const inventoryCountRoutes = require("./routes/inventoryCountRoutes");
const eventRoutes = require("./routes/eventRoutes");
const reconciliationRoutes = require("./routes/reconciliationRoutes");
const observabilityRoutes = require("./routes/observabilityRoutes");
const streamRoutes = require("./routes/streamRoutes");
const chaosRoutes = require("./routes/chaosRoutes");
const distributedRoutes = require("./routes/distributedRoutes");
const { getPublicReceipt } = require("./controllers/receiptPublicController");
const { apiLimiter, authLimiter } = require("./middlewares/rateLimiter");
const { attachRequestId } = require("./middlewares/requestId");
const { attachRequestLogger } = require("./middlewares/requestLogger");
const timeoutMiddleware = require("./middlewares/timeout");
const { validateJsonContentType } = require("./middlewares/validateJsonContentType");
const { metricsTracker } = require("./middlewares/metricsTracker");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const { logger } = require("./utils/logger");
const { getPrometheusMetrics } = require("./controllers/metricsController");

const app = express();

if (trustProxy !== false) {
  app.set("trust proxy", trustProxy);
}

app.use(attachRequestId);
app.use(attachRequestLogger);
// Phase 7.1: Prometheus scrape (optional); not subject to API rate limits.
app.get("/metrics", getPrometheusMetrics);
app.use(apiLimiter);

setupGateway(app);

const { getHealth, getReady } = require("./controllers/healthController");

// Public liveness probe: lightweight; DB check optional for strict orchestrators.
app.get("/health", getHealth);
/** Alias when load balancers or dashboards are configured with a path under `/api`. */
app.get("/api/health", getHealth);

// Readiness: DB required; Redis when REDIS_URL is set (queue/cache).
app.get("/ready", getReady);
app.get("/api/ready", getReady);

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: req.requestId }),
    serializers: {
      req(req) {
        return { method: req.method, url: req.url, requestId: req.requestId };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    autoLogging: false,
  })
);

const { stripeApiWebhook, paystackApiWebhook } = require("./controllers/billingController");
// Phase 7.1: dedicated API webhooks (Stripe + Paystack require raw body for signature verification).
app.post("/api/payments/webhook/stripe", express.raw({ type: "application/json" }), stripeApiWebhook);
app.post("/api/payments/webhook/paystack", express.raw({ type: "application/json" }), paystackApiWebhook);
app.post("/billing/webhooks/stripe", express.raw({ type: "application/json" }), stripeApiWebhook);
app.post("/billing/webhooks/paystack", express.raw({ type: "application/json" }), paystackApiWebhook);
/** When payment provider URL is registered as `…/api/billing/webhooks/…` (API base includes `/api`). */
app.post("/api/billing/webhooks/stripe", express.raw({ type: "application/json" }), stripeApiWebhook);
app.post("/api/billing/webhooks/paystack", express.raw({ type: "application/json" }), paystackApiWebhook);

/** Phase 7.12.1: public receipt PDF (no auth; token is unguessable). */
app.get("/receipts/public/:token", getPublicReceipt);
app.get("/api/receipts/public/:token", getPublicReceipt);

/** Larger JSON body for Phase 7.13.3 IndexedDB cloud backup uploads (admin-only route). */
function jsonBodyParser(req, res, next) {
  const url = req.originalUrl || req.url || "";
  const large =
    req.method === "POST" &&
    (url === "/backups/indexeddb" ||
      url.startsWith("/backups/indexeddb?") ||
      url === "/api/backups/indexeddb" ||
      url.startsWith("/api/backups/indexeddb?"));
  return express.json({ limit: large ? "32mb" : "1mb" })(req, res, next);
}

app.use(jsonBodyParser);
app.use(timeoutMiddleware);
app.use(validateJsonContentType);
app.use((req, res, next) => {
  req.log.info(
    {
      route: req.originalUrl,
      method: req.method,
    },
    "REQUEST_START"
  );
  res.on("finish", () => {
    req.log.info(
      {
        route: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        userId: req.auth?.userId,
        businessId: req.auth?.businessId,
      },
      "REQUEST_COMPLETE"
    );
  });
  next();
});
app.use(metricsTracker);

if (nodeEnv !== "production") {
  const debugRoutes = require("./routes/debugRoutes");
  const { requireAuth } = require("./middlewares/auth");
  const { getSyncDiagnostics, getTransactionDebug, getExpensesDebug } = require("./controllers/debugController");
  app.use("/debug", debugRoutes);
  app.get("/debug/sync", requireAuth, getSyncDiagnostics);
  app.get("/debug/transaction/:id", requireAuth, getTransactionDebug);
  app.get("/debug/expenses", requireAuth, getExpensesDebug);
}

app.use("/auth", authLimiter);
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/inventory-count", inventoryCountRoutes);
app.use("/transactions", transactionRoutes);
app.use("/", dashboardRoutes);
app.use("/", systemRoutes);
app.use("/", settingsRoutes);
app.use("/", adminRoutes);
app.use("/", customerRoutes);
app.use("/", reportRoutes);
app.use("/", exportRoutes);
app.use("/", onboardingRoutes);
app.use("/", analyticsRoutes);
app.use("/", billingRoutes);
app.use("/", auditRoutes);
app.use("/", backupRoutes);
app.use("/", sessionRoutes);
app.use("/", supportRoutes);
app.use("/", staffRoutes);
app.use("/api/admin", adminApiRoutes);
app.use("/api/bi", biRoutes);
app.use("/", usageRoutes);
app.use("/", marketingRoutes);
app.use("/", expenseRoutes);
/** Phase 4B: integrity event ingest (JWT + tenant-scoped); path prefix matches REST versioning. */
app.use("/api/v1", eventRoutes);
app.use("/api/v1", reconciliationRoutes);
/** Phase 6: admin financial observability (integrity timeline, health, anomalies). */
app.use("/api/v1", observabilityRoutes);
/** Phase 6.5: in-process financial event stream (recent buffer + counters). */
app.use("/api/v1", streamRoutes);
/** Phase 7: chaos / resilience drills (env-gated; admin-only). */
app.use("/api/v1", chaosRoutes);
/** Phase 8: shard routing + derived global view metadata (admin-only). */
app.use("/api/v1", distributedRoutes);

/**
 * Controlled `/api/*` aliases — base-path compatibility when `VITE_API_URL` is `https://host/api`
 * (requests become `/api/products`, not `/products`). Do not duplicate `/api/v1/*`, `/api/admin`, `/api/bi`.
 * Prefer setting the client base URL to `https://host` with paths as in `src/services/api.js`.
 */
app.use("/api/auth", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory-count", inventoryCountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api", customerRoutes);
app.use("/api", settingsRoutes);
app.use("/api", expenseRoutes);
/** `/dashboard-stats`, `/analytics/daily-summary` — shell loads these without `/api` in the path string. */
app.use("/api", dashboardRoutes);
/** `/audit-events/bulk`, `/audit-logs` — offline sync audit ingest when `VITE_API_URL` ends with `/api`. */
app.use("/api", auditRoutes);

app.use(notFound);
app.use(errorHandler);

const { registerDefaultSubscribers } = require("./streaming/subscribers/registerDefaultSubscribers");
registerDefaultSubscribers();

module.exports = app;
