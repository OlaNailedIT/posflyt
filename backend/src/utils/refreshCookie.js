const {
  refreshCookieName,
  refreshCookieMaxAgeMs,
  nodeEnv,
} = require("../config/env");

function setRefreshTokenCookie(res, rawRefreshToken) {
  res.cookie(refreshCookieName, rawRefreshToken, {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: refreshCookieMaxAgeMs,
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(refreshCookieName, { path: "/" });
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };
