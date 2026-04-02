const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getCurrentSubscription,
  postCheckoutSession,
  stripeWebhook,
  paystackWebhook,
  listPayments,
  confirmPayment,
} = require("../controllers/billingController");

const router = express.Router();

router.post("/billing/webhooks/stripe", stripeWebhook);
router.post("/billing/webhooks/paystack", paystackWebhook);

router.get("/billing/subscription", requireAuth, requireAdmin, getCurrentSubscription);
router.post("/billing/checkout-session", requireAuth, requireAdmin, postCheckoutSession);
router.post("/billing/confirm", requireAuth, requireAdmin, confirmPayment);
router.get("/billing/payment-history", requireAuth, requireAdmin, listPayments);

module.exports = router;
