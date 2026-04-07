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

/**
 * Express `trust proxy` setting for load balancers / reverse proxies (Phase 7.4).
 * When unset or false, client IP is the direct socket (correct for local dev).
 * Set to `1` or `true` when behind one proxy (e.g. Render, single ALB hop).
 * @returns {boolean | number}
 */
function parseTrustProxy() {
  const v = process.env.TRUST_PROXY;
  if (v === undefined || v === "") return false;
  if (v === "true" || v === "1") return 1;
  if (v === "false" || v === "0") return false;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  return false;
}

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
  /** 0–1; set e.g. 0.1 in production for sampled performance traces (Phase 7.1). */
  sentryTracesSampleRate: Math.min(
    1,
    Math.max(0, Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0") || 0)
  ),
  /** Expose GET /metrics (Prometheus). Off by default; enable in prod for scrapers. */
  metricsEnabled: process.env.METRICS_ENABLED === "true",
  /** If set, require Authorization: Bearer <token> for /metrics. */
  metricsBearerToken: process.env.METRICS_BEARER_TOKEN || "",
  /** Behind LB: set `1` so rate limits and logs use real client IP (X-Forwarded-For). */
  trustProxy: parseTrustProxy(),
};
