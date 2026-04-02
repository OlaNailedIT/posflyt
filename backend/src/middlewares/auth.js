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
        message: "Unauthorized",
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
          message: "Session expired",
          location: "middlewares/auth.requireAuth",
          details: { requestId: req.requestId },
        });
      }
    }
    req.auth = payload;
    return next();
  } catch (error) {
    return sendError(res, {
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "Invalid or expired token",
      location: "middlewares/auth.requireAuth",
      details: { requestId: req.requestId },
    });
  }
}

module.exports = { requireAuth };
