const { z } = require("zod");
const { registerOwner, login, staffLogin, getSessionPayload } = require("../services/authService");
const { rotateRefreshSession, revokeRefreshByRaw } = require("../services/refreshTokenService");
const { sendOk, sendError } = require("../utils/http");
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require("../utils/refreshCookie");
const { refreshCookieName } = require("../config/env");

const registerSchema = z
  .object({
    businessName: z.string().min(2),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

const staffLoginSchema = z
  .object({
    phone: z.string().trim().min(8).max(20),
    pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
  })
  .strict();

async function register(req, res, next) {
  try {
    if (req.timedout) return;
    const payload = registerSchema.parse(req.body);
    const data = await registerOwner({
      ...payload,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });
    if (data.refreshToken) {
      setRefreshTokenCookie(res, data.refreshToken);
    }
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/authController.register",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function loginHandler(req, res, next) {
  try {
    if (req.timedout) return;
    const payload = loginSchema.parse(req.body);
    const data = await login({
      ...payload,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
      requestId: req.requestId,
    });
    if (data.refreshToken) {
      setRefreshTokenCookie(res, data.refreshToken);
    }
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/authController.loginHandler",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function refreshHandler(req, res, next) {
  try {
    if (req.timedout) return;
    const rawRefreshToken = req.cookies?.[refreshCookieName] || req.body?.refreshToken;
    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      return sendError(res, {
        statusCode: 401,
        code: "AUTH_REFRESH_REQUIRED",
        message: "Unauthorized: refresh token missing",
        location: "controllers/authController.refreshHandler",
        details: { requestId: req.requestId },
      });
    }

    const data = await rotateRefreshSession({
      rawRefreshToken,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });
    if (data.refreshToken) {
      setRefreshTokenCookie(res, data.refreshToken);
    }
    return sendOk(res, data);
  } catch (error) {
    if (error.statusCode === 401) {
      return sendError(res, {
        statusCode: 401,
        code: "AUTH_REFRESH_FAILED",
        message: "Unauthorized: Invalid or expired refresh token",
        location: "controllers/authController.refreshHandler",
        details: { requestId: req.requestId },
      });
    }
    return next(error);
  }
}

async function staffLoginHandler(req, res, next) {
  try {
    if (req.timedout) return;
    const payload = staffLoginSchema.parse(req.body);
    const data = await staffLogin({
      phone: payload.phone,
      pin: payload.pin,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
      requestId: req.requestId,
    });
    if (data.refreshToken) {
      setRefreshTokenCookie(res, data.refreshToken);
    }
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/authController.staffLoginHandler",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function getSessionHandler(req, res, next) {
  try {
    const payload = await getSessionPayload(req.auth.userId);
    if (!payload) {
      return sendError(res, {
        statusCode: 401,
        code: "SESSION_INVALID",
        message: "Session no longer valid",
        location: "controllers/authController.getSessionHandler",
        details: { requestId: req.requestId },
      });
    }
    return sendOk(res, payload);
  } catch (error) {
    return next(error);
  }
}

async function logoutHandler(req, res, next) {
  try {
    if (req.timedout) return;
    const raw = req.cookies?.[refreshCookieName];
    if (raw) {
      await revokeRefreshByRaw(raw);
    }
    clearRefreshTokenCookie(res);
    return sendOk(res, { sessionRevoked: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  loginHandler,
  staffLoginHandler,
  getSessionHandler,
  refreshHandler,
  logoutHandler,
};
