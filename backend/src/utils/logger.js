const pino = require("pino");
const { nodeEnv, logLevel } = require("../config/env");

/** Phase 7.5: default `info` in production; use `debug` only for short-lived troubleshooting. */
const logger = pino({
  level: logLevel || (nodeEnv === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
