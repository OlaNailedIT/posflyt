const { z } = require("zod");
const { registerOwner, login } = require("../services/authService");
const { sendOk, sendError } = require("../utils/http");

const registerSchema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function register(req, res, next) {
  try {
    const payload = registerSchema.parse(req.body);
    const data = await registerOwner({
      ...payload,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });
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
    const payload = loginSchema.parse(req.body);
    const data = await login({
      ...payload,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });
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

module.exports = { register, loginHandler };
