/** Load env before app (routes may pull services that use DATABASE_URL). */
require("./config/env");
const app = require("./app");
const prisma = require("./config/prisma");
const { port } = require("./config/env");
const { startBackupScheduler } = require("./services/backupService");
const { startInventoryIntegrityMonitor } = require("./services/inventoryIntegrityService");
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

  try {
    await prisma.$connect();
    logger.info("Database client connected");
  } catch (err) {
    logger.error({ err }, "Database connection failed");
    process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.info({ port }, "POSflyt backend listening");
  });

  startBackupScheduler();
  startInventoryIntegrityMonitor();

  async function shutdown() {
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
