const express = require("express");
const {
  register,
  loginHandler,
  staffLoginHandler,
  getSessionHandler,
  refreshHandler,
  logoutHandler,
} = require("../controllers/authController");
const { loginRateLimit } = require("../middlewares/rateLimit");
const { requireAuth } = require("../middlewares/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", loginRateLimit, loginHandler);
router.post("/staff-login", loginRateLimit, staffLoginHandler);
router.get("/session", requireAuth, getSessionHandler);
router.post("/refresh", loginRateLimit, refreshHandler);
router.post("/logout", loginRateLimit, logoutHandler);

module.exports = router;
