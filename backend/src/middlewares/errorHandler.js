const { sendError } = require("../utils/http");
const { incrementApi5xx } = require("../services/runtimeMetricsService");
const { logger } = require("../utils/logger");
const { captureException } = require("../utils/sentry");

function notFound(req, res) {
  return sendError(res, {
    statusCode: 404,
    code: "ROUTE_NOT_FOUND",
    message: "Route not found",
    location: "middlewares/errorHandler.notFound",
    details: { requestId: req.requestId },
  });
}

function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  const code = err.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED");
  const message = err.message || "Internal Server Error";
  const location = err.location || "middlewares/errorHandler.errorHandler";
  if (status >= 500) incrementApi5xx();
  logger.error({
    status,
    code,
    message,
    location,
    requestId: req.requestId,
  }, "Unhandled API error");
  captureException(err, {
    requestId: req.requestId,
    code,
    location,
    userId: req.user?.id,
  });
  return sendError(res, {
    statusCode: status,
    code,
    message: status >= 500 ? "Internal Server Error" : message,
    location,
    details: { requestId: req.requestId },
  });
}

module.exports = { notFound, errorHandler };
