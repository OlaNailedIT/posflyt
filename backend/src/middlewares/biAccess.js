const { sendError } = require("../utils/http");

/** BI / analytics-style endpoints: business admins and managers (no cashier). */
function requireBiAccess(req, res, next) {
  const role = req.auth?.role;
  if (role !== "ADMIN" && role !== "MANAGER") {
    return sendError(res, {
      statusCode: 403,
      code: "BI_ACCESS_REQUIRED",
      message: "Business intelligence requires manager or administrator role",
      location: "middlewares/biAccess.requireBiAccess",
      details: { requestId: req.requestId },
    });
  }
  return next();
}

module.exports = { requireBiAccess };
