const { sendError } = require("../utils/http");

const PERMISSIONS_BY_ROLE = {
  ADMIN: {
    editProducts: true,
    viewReports: true,
    accessSettings: true,
    viewStaffAnalytics: true,
  },
  MANAGER: {
    editProducts: true,
    viewReports: true,
    accessSettings: false,
    viewStaffAnalytics: true,
  },
  CASHIER: {
    editProducts: false,
    viewReports: false,
    accessSettings: false,
    viewStaffAnalytics: false,
  },
};

function hasPermission(role, permission) {
  return Boolean(PERMISSIONS_BY_ROLE[role]?.[permission]);
}

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    const role = req.auth?.role;
    if (!hasPermission(role, permission)) {
      return sendError(res, {
        statusCode: 403,
        code: "INSUFFICIENT_PERMISSIONS",
        message: "Insufficient permissions",
        location: "middlewares/permission.requirePermission",
        details: { requestId: req.requestId, permission },
      });
    }
    return next();
  };
}

module.exports = { hasPermission, requirePermission, PERMISSIONS_BY_ROLE };
