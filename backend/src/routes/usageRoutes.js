const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getUsageSummary, getUsageFeatures, postWhatsAppReceiptAttempt } = require("../controllers/usageController");

const router = express.Router();

router.get("/usage/summary", requireAuth, getUsageSummary);
router.get("/usage/features", requireAuth, getUsageFeatures);
router.post("/usage/whatsapp-receipt-attempt", requireAuth, postWhatsAppReceiptAttempt);

module.exports = router;
