const { sendError } = require("../utils/http");
const { logger } = require("../utils/logger");
const { captureException } = require("../utils/sentry");
const { logSchemaDrift } = require("../utils/schemaDriftLog");

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

  const log = req.log || logger;
  const logBase = {
    event: "API_ERROR",
    code,
    message,
    route: req.originalUrl,
    userId: req.auth?.userId,
    businessId: req.auth?.businessId,
  };

  const prismaCode = err.code && String(err.code).match(/^P[0-9]{4}$/) ? String(err.code) : null;
  if (prismaCode) {
    logSchemaDrift({
      layer: "prisma",
      prismaCode,
      message: err.message,
      route: req.originalUrl,
      meta: err.meta,
    });
  }

  if (code === "CONFLICT" && err.conflictData) {
    log.warn(logBase, "API error response");
    return sendError(res, {
      statusCode: 409,
      code: "CONFLICT",
      message: message || "Record has been updated by another source",
      location,
      details: { requestId: req.requestId },
      data: err.conflictData,
    });
  }

  if (status < 500) {
    log.warn(logBase, "API error response");
  } else {
    log.error({ ...logBase, status, location }, "Unhandled API error");
    captureException(err, {
      requestId: req.requestId,
      code,
      location,
      userId: req.auth?.userId,
    });
  }

  const extra =
    err.details && typeof err.details === "object" && !Array.isArray(err.details) ? err.details : {};

  return sendError(res, {
    statusCode: status,
    code,
    message: status >= 500 ? "Internal Server Error" : message,
    location,
    details: { requestId: req.requestId, ...extra },
  });
}

module.exports = { notFound, errorHandler };
