const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { loginRateLimit } = require("../middlewares/rateLimit");
const {
  getStaff,
  postStaff,
  disableStaffMember,
  reactivateStaffMember,
} = require("../controllers/staffController");
const {
  postStaffInvite,
  getPublicInvitePreview,
  postAcceptInvite,
} = require("../controllers/staffInviteController");

const router = express.Router();

router.get("/staff/invite/:token", getPublicInvitePreview);
router.post("/staff/accept-invite", loginRateLimit, postAcceptInvite);
router.post("/staff/invite", requireAuth, requireAdmin, postStaffInvite);

router.get("/staff", requireAuth, requireAdmin, getStaff);
router.post("/staff", requireAuth, requireAdmin, postStaff);
router.post("/staff/:id/disable", requireAuth, requireAdmin, disableStaffMember);
router.post("/staff/:id/reactivate", requireAuth, requireAdmin, reactivateStaffMember);

module.exports = router;
