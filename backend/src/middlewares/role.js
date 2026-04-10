const { sendError } = require("../utils/http");

function requireAdmin(req, res, next) {
  if (req.auth?.role !== "ADMIN") {
    return sendError(res, {
      statusCode: 403,
      code: "ADMIN_REQUIRED",
      message: "Admin access required",
      location: "middlewares/role.requireAdmin",
      details: { requestId: req.requestId },
    });
  }
  return next();
}

/** Phase 7.13.1: daily close for admin or manager (operations). */
function requireAdminOrManager(req, res, next) {
  const r = req.auth?.role;
  if (r !== "ADMIN" && r !== "MANAGER") {
    return sendError(res, {
      statusCode: 403,
      code: "ADMIN_REQUIRED",
      message: "Admin or manager access required",
      location: "middlewares/role.requireAdminOrManager",
      details: { requestId: req.requestId },
    });
  }
  return next();
}

module.exports = { requireAdmin, requireAdminOrManager };
