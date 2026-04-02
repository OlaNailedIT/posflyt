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

router.use(requireAuth);
router.use(requireAdmin);
router.get("/staff", getStaff);
router.post("/staff", postStaff);
router.post("/staff/:id/disable", disableStaffMember);
router.post("/staff/:id/reactivate", reactivateStaffMember);

module.exports = router;
