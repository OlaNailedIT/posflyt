const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const biLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.auth?.userId;
    if (uid) return `bi:${uid}`;
    return ipKeyGenerator(req.ip ?? "");
  },
});

module.exports = { biLimiter };
