/**
 * Structured logging for `/api/admin/*` — ties admin actions to requestId (audit trail in logs).
 */
function logAdminApiAccess(req, res, next) {
  req.log?.info(
    {
      event: "ADMIN_API",
      requestId: req.requestId,
      userId: req.auth?.userId,
      businessId: req.auth?.businessId,
      method: req.method,
      path: req.originalUrl,
    },
    "admin api"
  );
  next();
}

module.exports = { logAdminApiAccess };
