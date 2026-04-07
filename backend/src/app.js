const { corsOrigin } = require("./config/env");
const express = require("express");
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
const { rateLimit } = require("./middlewares/rateLimit");
const { requestContext } = require("./middlewares/requestContext");
const { metricsTracker } = require("./middlewares/metricsTracker");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const prisma = require("./config/prisma");
const { sendOk } = require("./utils/http");
const { logger } = require("./utils/logger");

const PUBLIC_HEALTH_SERVICE_NAME = "posflyt-backend";

const app = express();

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
  })
);
app.use(cookieParser());
app.use(helmet());
app.use(requestContext);

// Public liveness probe: no auth, no JSON/rate-limit/metrics middleware (single /health route in this app).
app.get("/health", async (req, res) => {
  logger.info(
    { route: "/health", requestId: req.requestId },
    "Health check requested"
  );
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendOk(res, {
      service: PUBLIC_HEALTH_SERVICE_NAME,
      database: "connected",
    });
  } catch (err) {
    logger.warn({ err }, "GET /health database check failed");
    return res.status(503).json({
      status: "error",
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
app.use(express.json());
app.use(metricsTracker);
app.use(rateLimit);

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
