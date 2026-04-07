const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePlan } = require("../middlewares/subscription");
const { requireFeature } = require("../middlewares/requireFeature");
const { getExport } = require("../controllers/exportController");

const router = express.Router();

router.get("/exports/:type", requireAuth, requirePlan("BASIC"), requireFeature("CSV_EXPORT"), getExport);

module.exports = router;
