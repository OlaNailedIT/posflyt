const {
  exportTransactionsCsv,
  exportProductsCsv,
  exportCustomersCsv,
} = require("../services/exportService");
const { sendError } = require("../utils/http");

async function getExport(req, res, next) {
  try {
    const { type } = req.params;
    let csv = "";
    if (type === "transactions") csv = await exportTransactionsCsv(req.auth.businessId);
    else if (type === "products") csv = await exportProductsCsv(req.auth.businessId);
    else if (type === "customers") csv = await exportCustomersCsv(req.auth.businessId);
    else {
      return sendError(res, {
        statusCode: 400,
        code: "UNSUPPORTED_EXPORT_TYPE",
        message: "Unsupported export type",
        location: "controllers/exportController.getExport",
        details: { requestId: req.requestId, type },
      });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);
    // CSV responses are intentionally raw (not JSON); use sendOk/sendError for JSON APIs only.
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getExport };
