const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { getStreamRecent, getStreamStats } = require("../controllers/streamController");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/stream/recent", getStreamRecent);
router.get("/stream/stats", getStreamStats);

module.exports = router;
