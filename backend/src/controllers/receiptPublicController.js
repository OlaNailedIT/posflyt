const { logger } = require("../utils/logger");
const {
  findTransactionForPublicToken,
  streamReceiptPdfForTransaction,
} = require("../services/receiptService");

/**
 * GET /receipts/public/:token — unauthenticated PDF (Phase 7.12.1).
 */
async function getPublicReceipt(req, res, next) {
  try {
    const token = req.params.token;
    const row = await findTransactionForPublicToken(token);
    if (!row?.receiptId) {
      return res.status(404).type("text/plain").send("Receipt not found");
    }
    logger.info(
      {
        event: "receiptShared",
        receiptType: "pdf",
        transactionId: row.id,
        deliveryMethod: "public_link",
      },
      "receipt viewed via public link"
    );
    await streamReceiptPdfForTransaction(res, row);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).type("text/plain").send("Receipt not found");
    }
    return next(error);
  }
}

module.exports = { getPublicReceipt };
