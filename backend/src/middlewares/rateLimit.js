const { sendError } = require("../utils/http");

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;
const buckets = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_REQUESTS = 12;
const loginBuckets = new Map();

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > MAX_REQUESTS) {
    return sendError(res, {
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "Too many requests. Try again shortly.",
      location: "middlewares/rateLimit.rateLimit",
      details: { requestId: req.requestId },
    });
  }

  return next();
}

function loginRateLimit(req, res, next) {
  const key = `${req.ip || "unknown"}:${(req.body?.email || "").toLowerCase()}`;
  const now = Date.now();
  const bucket = loginBuckets.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + LOGIN_WINDOW_MS;
  }

  bucket.count += 1;
  loginBuckets.set(key, bucket);

  if (bucket.count > LOGIN_MAX_REQUESTS) {
    return sendError(res, {
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "Too many login attempts. Try again later.",
      location: "middlewares/rateLimit.loginRateLimit",
      details: { requestId: req.requestId },
    });
  }

  return next();
}

module.exports = { rateLimit, loginRateLimit };
