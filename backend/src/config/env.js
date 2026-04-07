const path = require("path");
const dotenv = require("dotenv");

// Always load backend/.env first (works when cwd is repo root or backend/)
const backendEnv = path.resolve(__dirname, "../../.env");
dotenv.config({ path: backendEnv });
dotenv.config();

const JWT_REFRESH_TTL_MS =
  Number(process.env.JWT_REFRESH_TTL_MS) > 0
    ? Number(process.env.JWT_REFRESH_TTL_MS)
    : 1000 * 60 * 60 * 24 * 30;

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "unsafe-dev-secret",
  jwtIssuer: process.env.JWT_ISSUER || "posflyt-api",
  jwtAudience: process.env.JWT_AUDIENCE || "posflyt-client",
  /** Access JWT lifetime; refresh tokens cover longer sessions (see refreshTokenService). */
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "1h",
  nodeEnv: process.env.NODE_ENV || "development",
  /**
   * Comma-separated origins for credentialed CORS (browser clients). HttpOnly refresh cookies require
   * credentials + explicit origins (not "*"). Default covers local Vite dev.
   */
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173",
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || "posflyt_rt",
  refreshCookieMaxAgeMs: JWT_REFRESH_TTL_MS,
  jwtRefreshTtlMs: JWT_REFRESH_TTL_MS,
  logLevel: process.env.LOG_LEVEL || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || "",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  sentryDsn: process.env.SENTRY_DSN || "",
  sentryRelease: process.env.SENTRY_RELEASE || "",
};
