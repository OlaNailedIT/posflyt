/**
 * Phase 9: background worker — run with `npm run worker` (requires Redis + QUEUE_ENABLED=true).
 */
require("../config/env");
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { redisUrl, queueEnabled } = require("../config/env");
const { logger } = require("../utils/logger");
const { processDuePaymentRetries } = require("../services/paymentRetryService");
const { QUEUE_NAME } = require("./queue");

async function main() {
  if (!queueEnabled) {
    logger.warn("Worker exiting: QUEUE_ENABLED is not true");
    process.exit(0);
  }
  if (!redisUrl) {
    logger.error("QUEUE_ENABLED=true but REDIS_URL is missing — worker cannot start");
    process.exit(1);
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  try {
    await connection.ping();
  } catch (e) {
    logger.error({ err: e.message }, "Worker Redis connection failed");
    try {
      await connection.quit();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }

  logger.info({ queue: QUEUE_NAME }, "Payment worker started");

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "payment-retry") {
        return processDuePaymentRetries();
      }
      logger.warn({ jobId: job.id, name: job.name }, "unknown job");
      return { skipped: true };
    },
    { connection }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "job failed");
  });

  logger.info({ queue: QUEUE_NAME }, "BullMQ worker listening");

  async function shutdown() {
    await worker.close();
    await connection.quit();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  logger.error({ err: e.message }, "worker fatal");
  process.exit(1);
});
