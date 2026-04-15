const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const {
  createStaffInvite,
  getInvitePreview,
  acceptStaffInvite,
} = require("../services/staffInviteService");

const inviteBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(20),
    role: z.enum(["MANAGER", "CASHIER"]),
    storeId: z.string().uuid().optional().nullable(),
  })
  .strict();

const acceptBodySchema = z
  .object({
    token: z.string().min(16),
    pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
  })
  .strict();

async function postStaffInvite(req, res, next) {
  try {
    const payload = inviteBodySchema.parse(req.body);
    const data = await createStaffInvite(req.auth.businessId, payload, req.auth.userId);
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/staffInviteController.postStaffInvite",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function getPublicInvitePreview(req, res, next) {
  try {
    const token = req.params.token;
    const data = await getInvitePreview(token);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postAcceptInvite(req, res, next) {
  try {
    const body = acceptBodySchema.parse(req.body);
    const { user } = await acceptStaffInvite(body.token, body.pin);
    return sendOk(res, {
      ok: true,
      message: "Account ready. Sign in with your phone and PIN.",
      staff: user,
    });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/staffInviteController.postAcceptInvite",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = {
  postStaffInvite,
  getPublicInvitePreview,
  postAcceptInvite,
};
