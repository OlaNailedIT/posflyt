const { z } = require("zod");
const { applyInventoryCountSession, logSessionEvent } = require("../services/inventoryCountService");
const { sendOk, sendError } = require("../utils/http");

const finalizeSchema = z
  .object({
    sessionId: z.string().uuid(),
    lines: z
      .array(
        z.object({
          productId: z.string().uuid(),
          countedQty: z.coerce.number().nonnegative(),
        })
      )
      .min(1)
      .max(500),
    scanCountsByProductId: z.record(z.string(), z.number().int().nonnegative()).optional(),
  })
  .strict();

const sessionEventSchema = z
  .object({
    type: z.enum(["session_started", "session_paused", "session_resumed"]),
    sessionId: z.string().uuid(),
  })
  .strict();

async function postFinalize(req, res, next) {
  try {
    const payload = finalizeSchema.parse(req.body);
    const data = await applyInventoryCountSession(req.auth.businessId, req.auth.userId, payload);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/inventoryCountController.postFinalize",
        details: { errors: error.issues },
      });
    }
    return next(error);
  }
}

async function postSessionEvent(req, res, next) {
  try {
    const payload = sessionEventSchema.parse(req.body);
    const data = await logSessionEvent(req.auth.businessId, req.auth.userId, payload);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/inventoryCountController.postSessionEvent",
        details: { errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { postFinalize, postSessionEvent };
