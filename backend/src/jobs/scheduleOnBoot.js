const { queueEnabled } = require("../config/env");
const { logger } = require("../utils/logger");
const { scheduleRepeatingJobs } = require("./queue");

/**
 * Registers repeatable jobs when API boots (BullMQ dedupes by jobId).
 */
async function scheduleQueueJobsIfEnabled() {
  if (!queueEnabled) return;
  try {
    await scheduleRepeatingJobs();
  } catch (e) {
    if (String(e.message || e).includes("already exists")) {
      logger.info("Repeatable jobs already registered");
    } else {
      logger.error({ err: e.message }, "scheduleRepeatingJobs failed");
    }
  }
}

module.exports = { scheduleQueueJobsIfEnabled };
