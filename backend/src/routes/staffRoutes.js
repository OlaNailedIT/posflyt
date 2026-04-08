const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getStaff,
  postStaff,
  disableStaffMember,
  reactivateStaffMember,
} = require("../controllers/staffController");

const router = express.Router();

router.get("/staff", requireAuth, requireAdmin, getStaff);
router.post("/staff", requireAuth, requireAdmin, postStaff);
router.post("/staff/:id/disable", requireAuth, requireAdmin, disableStaffMember);
router.post("/staff/:id/reactivate", requireAuth, requireAdmin, reactivateStaffMember);

module.exports = router;
