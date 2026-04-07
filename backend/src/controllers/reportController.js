const { z } = require("zod");
const { getSalesReport } = require("../services/reportService");
const { sendOk, sendError } = require("../utils/http");

const querySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();

async function getSales(req, res, next) {
  try {
    const parsed = querySchema.parse(req.query);
    const from = parsed.from ? new Date(parsed.from) : undefined;
    const to = parsed.to ? new Date(parsed.to) : undefined;
    const data = await getSalesReport(req.auth.businessId, from, to);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/reportController.getSales",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getSales };
