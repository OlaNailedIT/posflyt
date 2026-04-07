const { corsOrigin, nodeEnv, trustProxy } = require("./config/env");
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");

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
const cookieParser = require("cookie-parser");
const { apiLimiter, authLimiter } = require("./middlewares/rateLimiter");
const { attachRequestId } = require("./middlewares/requestId");
const { attachRequestLogger } = require("./middlewares/requestLogger");
const timeoutMiddleware = require("./middlewares/timeout");
const { validateJsonContentType } = require("./middlewares/validateJsonContentType");
const { metricsTracker } = require("./middlewares/metricsTracker");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const prisma = require("./config/prisma");
const { sendOk, sendError } = require("./utils/http");
const { logger } = require("./utils/logger");
const { getPrometheusMetrics } = require("./controllers/metricsController");

const PUBLIC_HEALTH_SERVICE_NAME = "posflyt-backend";

const app = express();

if (trustProxy !== false) {
  app.set("trust proxy", trustProxy);
}

app.use(attachRequestId);
app.use(attachRequestLogger);
// Phase 7.1: Prometheus scrape (optional); not subject to API rate limits.
app.get("/metrics", getPrometheusMetrics);
app.use(apiLimiter);

const allowedOriginsList =
  corsOrigin === "*"
    ? true
    : corsOrigin
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOriginsList === true) return callback(null, true);
      if (Array.isArray(allowedOriginsList) && allowedOriginsList.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    exposedHeaders: ["x-request-id"],
  })
);
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts:
      nodeEnv === "production"
        ? { maxAge: 15552000, includeSubDomains: true, preload: false }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  })
);
app.use(compression({ threshold: 1024 }));

// Public liveness probe: no auth, no JSON/rate-limit/metrics middleware (single /health route in this app).
app.get("/health", async (req, res) => {
  req.log.info({ route: "/health" }, "Health check requested");
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendOk(res, {
      service: PUBLIC_HEALTH_SERVICE_NAME,
      database: "connected",
    });
  } catch (err) {
    req.log.warn({ err }, "GET /health database check failed");
    return sendError(res, {
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Database unavailable",
      data: {
        service: PUBLIC_HEALTH_SERVICE_NAME,
        database: "disconnected",
      },
    });
  }
});

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
app.use(express.json({ limit: "1mb" }));
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
  const { getSyncDiagnostics } = require("./controllers/debugController");
  app.use("/debug", debugRoutes);
  app.get("/debug/sync", requireAuth, getSyncDiagnostics);
}

app.use("/auth", authLimiter);
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
