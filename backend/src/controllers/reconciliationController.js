const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { runReconciliationScope } = require("../reconciliation/reconciliationService");
const { scheduleSnapshotRefresh } = require("../snapshot/snapshotRefresh");

const paramsSchema = z.object({
  clientTransactionId: z.string().min(1),
});

async function getTransactionReconciliation(req, res, next) {
  try {
    const { clientTransactionId } = paramsSchema.parse(req.params);
    const report = await runReconciliationScope({
      businessId: req.auth.businessId,
      clientTransactionId,
    });
    scheduleSnapshotRefresh(req.auth.businessId, clientTransactionId);
    return sendOk(res, { reconciliation: report });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/reconciliationController.getTransactionReconciliation",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getTransactionReconciliation };
