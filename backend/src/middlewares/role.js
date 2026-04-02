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

module.exports = { requireAdmin };
