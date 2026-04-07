const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getStatus, markActive } = require("../controllers/onboardingController");

const router = express.Router();

router.get("/onboarding/status", requireAuth, getStatus);
router.post("/onboarding/active", requireAuth, markActive);

module.exports = router;
