const express = require("express");
const { register, loginHandler } = require("../controllers/authController");
const { loginRateLimit } = require("../middlewares/rateLimit");

const router = express.Router();

router.post("/register", register);
router.post("/login", loginRateLimit, loginHandler);

module.exports = router;
