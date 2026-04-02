const { incrementApi5xx } = require("../services/runtimeMetricsService");

function metricsTracker(_req, res, next) {
  res.on("finish", () => {
    if (res.statusCode >= 500) {
      incrementApi5xx();
    }
  });
  return next();
}

module.exports = { metricsTracker };
