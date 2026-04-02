const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { logoutAllDevices, listActiveSessions } = require("../controllers/sessionController");

const router = express.Router();

router.post("/sessions/logout-all", requireAuth, logoutAllDevices);
router.get("/sessions/active", requireAuth, listActiveSessions);

module.exports = router;
