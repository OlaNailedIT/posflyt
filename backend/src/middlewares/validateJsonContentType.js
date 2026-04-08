const { sendError } = require("../utils/http");

/**
 * Require JSON bodies for mutating requests (webhooks use JSON and custom signatures).
 */
function validateJsonContentType(req, res, next) {
  if (req.timedout) return;
  if (req.method === "OPTIONS") return next();

  if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();

  const path = req.originalUrl || req.url || "";
  if (path.includes("/billing/webhooks") || path.includes("/api/payments/webhook")) return next();

  const rawLen = req.headers["content-length"];
  if (rawLen === undefined) {
    return next();
  }
  const byteLength = Number(rawLen);
  if (Number.isNaN(byteLength) || byteLength === 0) {
    return next();
  }

  const ct = req.headers["content-type"];
  if (!ct || !String(ct).toLowerCase().includes("application/json")) {
    return sendError(res, {
      statusCode: 400,
      code: "INVALID_CONTENT_TYPE",
      message: "Content-Type must be application/json",
      location: "middlewares/validateJsonContentType",
    });
  }

  return next();
}

module.exports = { validateJsonContentType };
