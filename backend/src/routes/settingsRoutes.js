const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { getSettings, putSettings } = require("../controllers/settingsController");

const router = express.Router();

router.get("/settings", requireAuth, getSettings);
router.put("/settings", requireAuth, requirePermission("accessSettings"), putSettings);

module.exports = router;
