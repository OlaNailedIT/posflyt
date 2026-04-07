/**
 * Platform domain — settings, backups, audit, support, system health, admin ops.
 */
module.exports = {
  settingsService: require("../../services/settingsService"),
  backupService: require("../../services/backupService"),
  auditService: require("../../services/auditService"),
  adminService: require("../../services/adminService"),
  adminOpsService: require("../../services/adminOpsService"),
};
