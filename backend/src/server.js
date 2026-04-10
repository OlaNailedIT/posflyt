/** Load env before app (routes may pull services that use DATABASE_URL). */
require("./config/env");
const app = require("./app");
const prisma = require("./config/prisma");
const { port, queueEnabled, redisUrl } = require("./config/env");
const { startBackupScheduler } = require("./services/backupService");
const { startInventoryIntegrityMonitor } = require("./services/inventoryIntegrityService");
const { scheduleQueueJobsIfEnabled } = require("./jobs/scheduleOnBoot");
const { processDuePaymentRetries } = require("./services/paymentRetryService");
const { startLowStockAlertScheduler } = require("./services/lowStockAlertService");
const { quitRedis, pingRedis, isRedisConfigured } = require("./config/redis");
const { disconnectReadPrisma } = require("./config/prismaRead");
const { logger } = require("./utils/logger");
const { initSentry } = require("./utils/sentry");

initSentry();

process.on("unhandledRejection", (err) => {
  logger.error({ err }, "UNHANDLED_REJECTION");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "UNCAUGHT_EXCEPTION");
  process.exit(1);
});

async function main() {
  logger.info({ service: "posflyt-backend" }, "Starting POSflyt backend");

  if (queueEnabled && !redisUrl) {
    logger.error("QUEUE_ENABLED=true requires REDIS_URL — aborting startup");
    process.exit(1);
  }

  try {
    await prisma.$connect();
    logger.info("Database client connected");
  } catch (err) {
    logger.error({ err }, "Database connection failed");
    process.exit(1);
  }

  if (isRedisConfigured()) {
    try {
      await pingRedis();
      logger.info("Redis reachable");
    } catch (err) {
      logger.error({ err: err.message }, "Redis ping failed — aborting startup");
      process.exit(1);
    }
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "POSflyt backend listening");
  });

  startBackupScheduler();
  startInventoryIntegrityMonitor();
  startLowStockAlertScheduler();

  try {
    await scheduleQueueJobsIfEnabled();
  } catch (e) {
    logger.error({ err: e.message }, "scheduleQueueJobsIfEnabled failed");
  }

  if (!queueEnabled || !redisUrl) {
    const intervalMs = 120_000;
    setInterval(() => {
      processDuePaymentRetries().catch((e) => {
        logger.error({ err: e.message }, "payment retry interval failed");
      });
    }, intervalMs);
    logger.info({ intervalMs }, "Fallback retry scheduler active");
  }

  async function shutdown() {
    await quitRedis();
    await disconnectReadPrisma();
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
