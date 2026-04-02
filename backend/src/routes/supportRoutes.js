const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getHelp, postIssue } = require("../controllers/supportController");

const router = express.Router();

router.get("/help-content", getHelp);
router.post("/issues/report", requireAuth, postIssue);

module.exports = router;
