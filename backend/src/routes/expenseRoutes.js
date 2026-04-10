const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireSubscriptionActive } = require("../middlewares/subscriptionActive");
const { requireFeature } = require("../middlewares/requireFeature");
const { postExpense, listExpenses, getExpenseMeta } = require("../controllers/expenseController");

const router = express.Router();

router.get(
  "/expenses/meta",
  requireAuth,
  requireSubscriptionActive,
  requireFeature("EXPENSES"),
  getExpenseMeta
);
router.post(
  "/expenses",
  requireAuth,
  requireSubscriptionActive,
  requireFeature("EXPENSES"),
  postExpense
);
router.get(
  "/expenses",
  requireAuth,
  requireSubscriptionActive,
  requireFeature("EXPENSES"),
  listExpenses
);

module.exports = router;
