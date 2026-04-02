const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");

function signAuthToken(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
}

function verifyAuthToken(token) {
  return jwt.verify(token, jwtSecret);
}

module.exports = { signAuthToken, verifyAuthToken };
