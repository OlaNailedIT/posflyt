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

// Readiness: DB required; Redis when REDIS_URL is set (queue/cache).
app.get("/ready", getReady);

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

/** Phase 7.12.1: public receipt PDF (no auth; token is unguessable). */
app.get("/receipts/public/:token", getPublicReceipt);

/** Larger JSON body for Phase 7.13.3 IndexedDB cloud backup uploads (admin-only route). */
function jsonBodyParser(req, res, next) {
  const url = req.originalUrl || req.url || "";
  const large =
    req.method === "POST" &&
    (url === "/backups/indexeddb" || url.startsWith("/backups/indexeddb?"));
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
