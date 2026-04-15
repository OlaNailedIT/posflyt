const { nodeEnv, chaosEngineEnabled, chaosEngineAllowProduction } = require("../config/env");

function isChaosEngineAllowed() {
  if (!chaosEngineEnabled) return false;
  if (nodeEnv === "production" && !chaosEngineAllowProduction) return false;
  return true;
}

module.exports = {
  isChaosEngineAllowed,
};
