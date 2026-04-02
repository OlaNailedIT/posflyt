const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getStatus, markActive } = require("../controllers/onboardingController");

const router = express.Router();

router.use(requireAuth);
router.get("/onboarding/status", getStatus);
router.post("/onboarding/active", markActive);

module.exports = router;
