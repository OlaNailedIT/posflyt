const { incrementApi5xx, recordHttpRequest } = require("../services/runtimeMetricsService");

function metricsTracker(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const path = req.originalUrl || req.url || "";
    if (path.startsWith("/metrics")) {
      return;
    }
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    if (res.statusCode >= 500) {
      incrementApi5xx();
    }
    recordHttpRequest({
      method: req.method,
      originalUrl: path,
      statusCode: res.statusCode,
      durationSeconds,
    });
  });
  return next();
}

module.exports = { metricsTracker };
