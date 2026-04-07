const express = require("express");
const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { logger } = require("../utils/logger");

const router = express.Router();

const leadSchema = z.object({
  email: z.string().email(),
  source: z.string().max(160).optional(),
  kind: z.enum(["newsletter", "guide", "webinar", "contact"]).optional(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  message: z.string().max(12000).optional(),
  utm: z.record(z.string(), z.string()).optional(),
});

/**
 * Public lead capture for CRM / automation (Phase 8). Wire webhooks or CRM in ops.
 */
router.post("/marketing/leads", (req, res, next) => {
  try {
    const data = leadSchema.parse(req.body);
    logger.info(
      {
        event: "MARKETING_LEAD",
        email: data.email,
        kind: data.kind,
        source: data.source,
        name: data.name,
        company: data.company,
        message: data.message,
        utm: data.utm,
        ip: req.ip,
      },
      "marketing lead capture"
    );
    return sendOk(res, { received: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Invalid lead payload",
        location: "routes/marketingRoutes.postLeads",
        details: { errors: err.issues },
      });
    }
    return next(err);
  }
});

module.exports = router;
