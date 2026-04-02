const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { createStaff, listStaff, disableStaff, reactivateStaff } = require("../services/staffService");

const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    password: z.string().min(6).max(128),
    role: z.enum(["MANAGER", "CASHIER"]),
  })
  .strict();
const reactivateStaffSchema = z
  .object({
    password: z.string().min(6).max(128),
  })
  .strict();

async function getStaff(req, res, next) {
  try {
    const data = await listStaff(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postStaff(req, res, next) {
  try {
    const payload = createStaffSchema.parse(req.body);
    const data = await createStaff(req.auth.businessId, payload, req.auth.userId);
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/staffController.postStaff",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function disableStaffMember(req, res, next) {
  try {
    const data = await disableStaff(req.auth.businessId, req.params.id, req.auth.userId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function reactivateStaffMember(req, res, next) {
  try {
    const payload = reactivateStaffSchema.parse(req.body);
    const data = await reactivateStaff(req.auth.businessId, req.params.id, payload, req.auth.userId);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/staffController.reactivateStaffMember",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getStaff, postStaff, disableStaffMember, reactivateStaffMember };
