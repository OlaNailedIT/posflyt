/**
 * Auth domain — sessions, JWT, refresh tokens, staff roles.
 * Services remain in `src/services`; import from here for cross-domain clarity.
 */
module.exports = {
  authService: require("../../services/authService"),
  refreshTokenService: require("../../services/refreshTokenService"),
  sessionService: require("../../services/sessionService"),
  staffService: require("../../services/staffService"),
};
