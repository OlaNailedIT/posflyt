const pino = require("pino");
const { nodeEnv, logLevel } = require("../config/env");

/** Phase 7.5: default `info` in production; use `debug` only for short-lived troubleshooting. */
const root = pino({
  level: logLevel || (nodeEnv === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Phase 9: stable service name for log aggregation (ELK/Datadog). */
const logger = root.child({ service: "posflyt-api" });

module.exports = { logger, rootLogger: root };
