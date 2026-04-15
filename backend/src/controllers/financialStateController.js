const { z } = require("zod");
const prisma = require("../config/prisma");
const { sendOk, sendError } = require("../utils/http");
const { getFinancialStateFast } = require("../snapshot/snapshotEngine");

const paramsSchema = z.object({
  clientTransactionId: z.string().min(1),
});

async function getFinancialStateForTransaction(req, res, next) {
  try {
    const { clientTransactionId } = paramsSchema.parse(req.params);
    const result = await getFinancialStateFast(prisma, req.auth.businessId, clientTransactionId);
    return sendOk(res, { financialState: result });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/financialStateController.getFinancialStateForTransaction",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getFinancialStateForTransaction };
