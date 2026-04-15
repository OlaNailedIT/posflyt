const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin, requireAdminOrManager } = require("../middlewares/role");
const { requireFeature } = require("../middlewares/requireFeature");
const {
  postTransaction,
  postTransactionReturn,
  getTransactions,
  getTransactionByClientId,
  getTransactionReceipt,
  postSettleTransactionCredit,
} = require("../controllers/transactionController");

const router = express.Router();

router.use(requireAuth);
router.post("/return", requireAdminOrManager, postTransactionReturn);
router.post(
  "/:id/settle-credit",
  requireAdmin,
  requireFeature("CREDIT_SALES"),
  postSettleTransactionCredit
);
router.get("/:id/receipt", getTransactionReceipt);
router.get("/:clientTransactionId", getTransactionByClientId);
router.post("/", postTransaction);
router.get("/", getTransactions);

module.exports = router;
