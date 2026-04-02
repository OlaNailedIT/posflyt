const express = require("express");
const { getSystemHealth, getReliabilitySummary } = require("../controllers/systemController");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");

const router = express.Router();

router.get("/system/health", getSystemHealth);
router.get("/system/reliability-summary", requireAuth, requireAdmin, getReliabilitySummary);

module.exports = router;
