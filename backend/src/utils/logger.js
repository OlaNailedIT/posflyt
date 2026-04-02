const pino = require("pino");
const { nodeEnv, logLevel } = require("../config/env");

const logger = pino({
  level: logLevel || (nodeEnv === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
