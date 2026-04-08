const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/** Stricter limit for monitoring APIs (DoS mitigation). Keyed by admin user id after auth. */
const adminOpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.auth?.userId;
    if (uid) return `admin:${uid}`;
    return ipKeyGenerator(req.ip ?? "");
  },
});

module.exports = { adminOpsLimiter };
