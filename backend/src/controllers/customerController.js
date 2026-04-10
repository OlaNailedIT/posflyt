const { z } = require("zod");
const { listCustomers, createCustomer, updateCustomer, settleCustomerCredit } = require("../services/customerService");
const { sendOk, sendError } = require("../utils/http");

const customerCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(3).max(30),
    email: z.string().trim().email().max(160).optional().or(z.literal("")),
  })
  .strict();

const customerUpdateSchema = customerCreateSchema.partial().extend({
  lastKnownUpdatedAt: z
    .string()
    .min(1, "lastKnownUpdatedAt is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid lastKnownUpdatedAt" }),
  force: z.boolean().optional(),
}).strict();

const settleCreditSchema = z
  .object({
    amount: z.coerce.number().positive(),
    request_id: z.string().uuid().optional(),
  })
  .strict();

async function getCustomers(req, res, next) {
  try {
    const data = await listCustomers(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postCustomer(req, res, next) {
  try {
    const payload = customerCreateSchema.parse(req.body);
    const data = await createCustomer(req.auth.businessId, payload, req.auth.userId);
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/customerController.postCustomer",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function putCustomer(req, res, next) {
  try {
    const payload = customerUpdateSchema.parse(req.body);
    const data = await updateCustomer(req.auth.businessId, req.params.id, payload);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/customerController.putCustomer",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function postSettleCredit(req, res, next) {
  try {
    const payload = settleCreditSchema.parse(req.body);
    const data = await settleCustomerCredit(
      req.auth.businessId,
      req.params.id,
      payload.amount,
      req.auth.userId,
      payload.request_id || null
    );
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/customerController.postSettleCredit",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getCustomers, postCustomer, putCustomer, postSettleCredit };
