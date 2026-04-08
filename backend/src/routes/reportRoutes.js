const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { requirePlan } = require("../middlewares/subscription");
const { requireFeature } = require("../middlewares/requireFeature");
const { getSales } = require("../controllers/reportController");

const router = express.Router();

router.get(
  "/reports/sales",
  requireAuth,
  requirePermission("viewReports"),
  requirePlan("BASIC"),
  requireFeature("REPORTING"),
  getSales
);

module.exports = router;
