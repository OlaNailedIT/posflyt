const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin, requireAdminOrManager } = require("../middlewares/role");
const {
  getAdminMetrics,
  getAdminSalesFeed,
  getAdminDailyCloseStatus,
  postAdminDailyClose,
  getAdminBillingOverview,
  getAdminWebhookEvents,
  getAdminPaymentsQuery,
  postAdminPaymentRetriesRun,
  getPaymentsReconcile,
  postPaymentsReconcileApply,
} = require("../controllers/adminController");

const router = express.Router();

router.get("/admin/sales-feed", requireAuth, requireAdmin, getAdminSalesFeed);
router.get("/admin/metrics", requireAuth, requireAdmin, getAdminMetrics);
router.get("/admin/billing-overview", requireAuth, requireAdmin, getAdminBillingOverview);
router.get("/admin/billing-webhook-events", requireAuth, requireAdmin, getAdminWebhookEvents);
router.get("/admin/payments-query", requireAuth, requireAdmin, getAdminPaymentsQuery);
router.post("/admin/payment-retries/run", requireAuth, requireAdmin, postAdminPaymentRetriesRun);
router.get("/admin/payments/reconcile", requireAuth, requireAdmin, getPaymentsReconcile);
router.post("/admin/payments/reconcile/apply", requireAuth, requireAdmin, postPaymentsReconcileApply);
router.get("/admin/daily-close", requireAuth, requireAdminOrManager, getAdminDailyCloseStatus);
router.post("/admin/daily-close", requireAuth, requireAdminOrManager, postAdminDailyClose);

module.exports = router;
