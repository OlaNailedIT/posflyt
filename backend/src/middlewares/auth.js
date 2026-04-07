const { verifyAuthToken } = require("../utils/jwt");
const { validateSession } = require("../services/sessionService");
const { sendError } = require("../utils/http");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return sendError(res, {
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Unauthorized: authentication required",
        location: "middlewares/auth.requireAuth",
        details: { requestId: req.requestId },
      });
    }

    const payload = verifyAuthToken(token);
    if (payload.jti) {
      const session = await validateSession(payload.jti);
      if (!session) {
        return sendError(res, {
          statusCode: 401,
          code: "SESSION_EXPIRED",
          message: "Unauthorized: session expired or revoked",
          location: "middlewares/auth.requireAuth",
          details: { requestId: req.requestId },
        });
      }
    }
    req.auth = payload;
    return next();
  } catch (error) {
    const code =
      error.name === "TokenExpiredError"
        ? "TOKEN_EXPIRED"
        : error.name === "JsonWebTokenError"
          ? "INVALID_TOKEN"
          : "INVALID_TOKEN";
    return sendError(res, {
      statusCode: 401,
      code,
      message: "Unauthorized: Invalid or expired token",
      location: "middlewares/auth.requireAuth",
      details: { requestId: req.requestId },
    });
  }
}

module.exports = { requireAuth };
