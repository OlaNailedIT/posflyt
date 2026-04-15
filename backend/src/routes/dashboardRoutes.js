const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireSubscriptionActive } = require("../middlewares/subscriptionActive");
const { getStats } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/dashboard-stats", requireAuth, requireSubscriptionActive, getStats);
/** Daily Profit Engine — same payload as dashboard-stats (explicit analytics path). */
router.get("/analytics/daily-summary", requireAuth, requireSubscriptionActive, getStats);

module.exports = router;
