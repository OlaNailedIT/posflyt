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

const nodeEnvResolved = process.env.NODE_ENV || "development";
const isProduction = nodeEnvResolved === "production";

if (isProduction && (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim() === "")) {
  throw new Error(
    "JWT_SECRET must be set when NODE_ENV=production. Refusing to start with an insecure default."
  );
}

const jwtSecretResolved = isProduction ? process.env.JWT_SECRET : process.env.JWT_SECRET || "unsafe-dev-secret";

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: jwtSecretResolved,
  jwtIssuer: process.env.JWT_ISSUER || "posflyt-api",
  jwtAudience: process.env.JWT_AUDIENCE || "posflyt-client",
  /** Access JWT lifetime; refresh tokens cover longer sessions (see refreshTokenService). */
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "1h",
  nodeEnv: nodeEnvResolved,
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
  /** When true, webhook requests are rejected if the provider webhook secret is not configured. */
  requireBillingWebhookSignature: process.env.REQUIRE_BILLING_WEBHOOK_SIGNATURE === "true",
  /**
   * Optional FREE trial length for new subscriptions (days). Default 0 = no automatic trial end date
   * (grandfathered behavior). Set e.g. 14 to record trialEndsAt on new businesses only.
   */
  billingTrialDays: Math.max(0, Number.parseInt(process.env.BILLING_TRIAL_DAYS || "0", 10) || 0),
  /** Days after paid `expiresAt` before access is revoked (Phase 7.4). */
  subscriptionGracePeriodDays: Math.max(
    0,
    Number.parseInt(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || "3", 10) || 0
  ),
  /** In-app / email reminders when trial ends within this many days (Phase 7.4). */
  trialWarningDaysBefore: Math.max(
    0,
    Number.parseInt(process.env.TRIAL_WARNING_DAYS_BEFORE || "3", 10) || 0
  ),
  /** `sandbox` | `live` — used for logs and future gateway API calls (never commit real keys). */
  billingMode: (process.env.BILLING_MODE || "sandbox").toLowerCase() === "live" ? "live" : "sandbox",
  /** Max automated payment retry attempts before marking FAILED (backend retry worker). */
  paymentRetryMaxAttempts: Math.max(1, Number.parseInt(process.env.PAYMENT_RETRY_MAX_ATTEMPTS || "5", 10) || 5),
  /** Optional Slack incoming webhook for billing alerts (max retries exceeded, etc.). */
  slackBillingWebhookUrl: process.env.SLACK_BILLING_WEBHOOK_URL || "",
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
  /** Phase 9: optional Redis for cache + BullMQ (same URL for both). */
  redisUrl: process.env.REDIS_URL || "",
  /** Optional read replica for analytics-heavy queries (Prisma second client). */
  databaseReadUrl: process.env.DATABASE_READ_URL || "",
  /** Public base URL for receipt share links (Phase 7.12.1). Defaults to local API origin. */
  apiPublicUrl:
    process.env.API_PUBLIC_URL ||
    `http://localhost:${Number(process.env.PORT || 4000)}`,
  /** Enable BullMQ workers + queue producers (requires Redis). */
  queueEnabled: process.env.QUEUE_ENABLED === "true",
  /** Default TTL seconds for distributed cache entries. */
  cacheTtlSeconds: Math.max(5, Number.parseInt(process.env.CACHE_TTL_SECONDS || "45", 10) || 45),
};
