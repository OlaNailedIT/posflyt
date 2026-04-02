const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getStats } = require("../controllers/dashboardController");

const router = express.Router();

router.use(requireAuth);
router.get("/dashboard-stats", getStats);

module.exports = router;
