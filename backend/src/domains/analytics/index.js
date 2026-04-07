/**
 * Analytics / BI domain — dashboards, BI snapshots, exports, feature flags, usage.
 */
module.exports = {
  analyticsService: require("../../services/analyticsService"),
  biService: require("../../services/biService"),
  dashboardService: require("../../services/dashboardService"),
  reportService: require("../../services/reportService"),
  exportService: require("../../services/exportService"),
  featureFlagService: require("../../services/featureFlagService"),
  usageQuotaService: require("../../services/usageQuotaService"),
};
