const {
  refreshCookieName,
  refreshCookieMaxAgeMs,
  nodeEnv,
} = require("../config/env");

function setRefreshTokenCookie(res, rawRefreshToken) {
  const options = {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: refreshCookieMaxAgeMs,
  };
  if (nodeEnv === "production" && !options.secure) {
    // eslint-disable-next-line no-console
    console.warn("Refresh cookie is not secure in production");
  }
  res.cookie(refreshCookieName, rawRefreshToken, options);
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(refreshCookieName, { path: "/" });
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };
