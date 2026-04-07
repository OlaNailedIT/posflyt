const { metricsEnabled, metricsBearerToken } = require("../config/env");
const { getPrometheusMetricsText } = require("../services/runtimeMetricsService");

/**
 * Prometheus text exposition (Phase 7.1). Enable with METRICS_ENABLED=true.
 * Optional METRICS_BEARER_TOKEN for scrape authentication.
 */
function getPrometheusMetrics(req, res) {
  if (!metricsEnabled) {
    res.status(404).end();
    return;
  }
  if (metricsBearerToken) {
    const header = req.headers.authorization || "";
    const expected = `Bearer ${metricsBearerToken}`;
    if (header !== expected) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="metrics"').end("Unauthorized");
      return;
    }
  }
  res
    .status(200)
    .set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
    .send(getPrometheusMetricsText());
}

module.exports = { getPrometheusMetrics };
