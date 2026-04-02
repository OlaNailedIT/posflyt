const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { requirePlan } = require("../middlewares/subscription");
const { getSales } = require("../controllers/reportController");

const router = express.Router();

router.get(
  "/reports/sales",
  requireAuth,
  requirePermission("viewReports"),
  requirePlan("BASIC"),
  getSales
);

module.exports = router;
