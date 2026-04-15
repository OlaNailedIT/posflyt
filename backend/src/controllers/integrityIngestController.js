const { sendOk, sendError } = require("../utils/http");
const { AppError } = require("../utils/AppError");
const { integrityIngestBodySchema } = require("../validation/integrityIngestSchema");
const { ingestIntegrityEvent } = require("../services/integrityIngestService");

async function postIntegrityEventIngest(req, res, next) {
  try {
    const body = integrityIngestBodySchema.parse(req.body);
    const result = await ingestIntegrityEvent({ auth: req.auth, body });
    return sendOk(res, result);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/integrityIngestController.postIntegrityEventIngest",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    if (error instanceof AppError) {
      return sendError(res, {
        statusCode: error.statusCode || 400,
        code: error.code,
        message: error.message,
        location: "controllers/integrityIngestController.postIntegrityEventIngest",
        details: { requestId: req.requestId },
      });
    }
    return next(error);
  }
}

module.exports = { postIntegrityEventIngest };
