const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { getSettings, putSettings } = require("../controllers/settingsController");

const router = express.Router();

router.use(requireAuth);
router.get("/settings", getSettings);
router.put("/settings", requirePermission("accessSettings"), putSettings);

module.exports = router;
