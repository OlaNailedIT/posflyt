const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { postFinalize, postSessionEvent } = require("../controllers/inventoryCountController");

const router = express.Router();

router.use(requireAuth);
router.post("/finalize", requirePermission("editProducts"), postFinalize);
router.post("/session-event", requirePermission("editProducts"), postSessionEvent);

module.exports = router;
