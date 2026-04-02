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
const { rateLimit } = require("./middlewares/rateLimit");
const { requestContext } = require("./middlewares/requestContext");
const { metricsTracker } = require("./middlewares/metricsTracker");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const { sendOk } = require("./utils/http");
const { logger } = require("./utils/logger");
const { corsOrigin } = require("./config/env");

const app = express();

const allowedOrigins = corsOrigin === "*" ? true : corsOrigin.split(",").map((value) => value.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(requestContext);
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

app.get("/health", (_req, res) => sendOk(res, { service: "backend", status: "up" }));
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
