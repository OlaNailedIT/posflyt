const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getCurrentSubscription,
  postCheckoutSession,
  listPayments,
  confirmPayment,
  postCancelSubscription,
  getLifecycleEvents,
  getLifecycleMetrics,
  exportPaymentsCsv,
} = require("../controllers/billingController");

const router = express.Router();

router.get("/billing/subscription", requireAuth, requireAdmin, getCurrentSubscription);
router.post("/billing/checkout-session", requireAuth, requireAdmin, postCheckoutSession);
router.post("/billing/confirm", requireAuth, requireAdmin, confirmPayment);
router.get("/billing/payment-history", requireAuth, requireAdmin, listPayments);
router.post("/billing/cancel", requireAuth, requireAdmin, postCancelSubscription);
router.get("/billing/lifecycle-events", requireAuth, requireAdmin, getLifecycleEvents);
router.get("/billing/lifecycle-metrics", requireAuth, requireAdmin, getLifecycleMetrics);
router.get("/billing/export/payments.csv", requireAuth, requireAdmin, exportPaymentsCsv);

module.exports = router;
