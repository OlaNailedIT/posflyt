function logBiApiAccess(req, res, next) {
  req.log?.info(
    {
      event: "BI_API",
      requestId: req.requestId,
      userId: req.auth?.userId,
      businessId: req.auth?.businessId,
      role: req.auth?.role,
      method: req.method,
      path: req.originalUrl,
    },
    "bi api"
  );
  next();
}

module.exports = { logBiApiAccess };
