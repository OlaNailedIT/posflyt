const { logger } = require("../utils/logger");

/**
 * Phase 7.5: child logger with requestId on every line for correlation (Loki/Datadog/etc.).
 */
function attachRequestLogger(req, res, next) {
  req.log = logger.child({ requestId: req.requestId });
  next();
}

module.exports = { attachRequestLogger };
