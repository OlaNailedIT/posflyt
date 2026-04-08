const express = require("express");
const { register, loginHandler, refreshHandler, logoutHandler } = require("../controllers/authController");
const { loginRateLimit } = require("../middlewares/rateLimit");

const router = express.Router();

router.post("/register", register);
router.post("/login", loginRateLimit, loginHandler);
router.post("/refresh", loginRateLimit, refreshHandler);
router.post("/logout", loginRateLimit, logoutHandler);

module.exports = router;
