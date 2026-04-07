const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { redisUrl, queueEnabled } = require("../config/env");
const { logger } = require("../utils/logger");

const QUEUE_NAME = "posflyt";

let queue;
let connection;

function getConnection() {
  if (!redisUrl) return null;
  if (!connection) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueue() {
  if (!queueEnabled || !redisUrl) return null;
  if (!queue) {
    const conn = getConnection();
    if (!conn) return null;
    queue = new Queue(QUEUE_NAME, { connection: conn });
    logger.info({ queue: QUEUE_NAME }, "BullMQ queue ready");
  }
  return queue;
}

async function scheduleRepeatingJobs() {
  const q = getQueue();
  if (!q) return;
  await q.add(
    "payment-retry",
    {},
    {
      repeat: { every: 120_000 },
      jobId: "repeat-payment-retry",
      removeOnComplete: 50,
      removeOnFail: 20,
    }
  );
  logger.info("Scheduled payment-retry job (every 2m)");
}

module.exports = { getQueue, getConnection, scheduleRepeatingJobs, QUEUE_NAME };
