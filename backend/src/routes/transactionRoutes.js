const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { requireFeature } = require("../middlewares/requireFeature");
const {
  postTransaction,
  getTransactions,
  getTransactionReceipt,
  postSettleTransactionCredit,
} = require("../controllers/transactionController");

const router = express.Router();

router.use(requireAuth);
router.post(
  "/:id/settle-credit",
  requireAdmin,
  requireFeature("CREDIT_SALES"),
  postSettleTransactionCredit
);
router.get("/:id/receipt", getTransactionReceipt);
router.post("/", postTransaction);
router.get("/", getTransactions);

module.exports = router;
