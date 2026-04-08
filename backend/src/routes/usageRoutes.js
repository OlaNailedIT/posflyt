const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getUsageSummary, getUsageFeatures } = require("../controllers/usageController");

const router = express.Router();

router.get("/usage/summary", requireAuth, getUsageSummary);
router.get("/usage/features", requireAuth, getUsageFeatures);

module.exports = router;
