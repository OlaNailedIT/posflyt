const jwt = require("jsonwebtoken");
const { jwtSecret, jwtIssuer, jwtAudience, jwtAccessExpiresIn } = require("../config/env");

const VERIFY_OPTIONS = {
  issuer: jwtIssuer,
  audience: jwtAudience,
  /** Small leeway for `exp` / `nbf` across client/server clock skew. */
  clockTolerance: 30,
};

function signAuthToken(payload) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: jwtAccessExpiresIn,
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

function verifyAuthToken(token) {
  return jwt.verify(token, jwtSecret, VERIFY_OPTIONS);
}

module.exports = { signAuthToken, verifyAuthToken };
