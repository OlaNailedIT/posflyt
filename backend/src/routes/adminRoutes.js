const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getAdminMetrics,
  getAdminSalesFeed,
  getAdminDailyCloseStatus,
  postAdminDailyClose,
} = require("../controllers/adminController");

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get("/admin/sales-feed", getAdminSalesFeed);
router.get("/admin/metrics", getAdminMetrics);
router.get("/admin/daily-close", getAdminDailyCloseStatus);
router.post("/admin/daily-close", postAdminDailyClose);

module.exports = router;
