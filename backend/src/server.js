const app = require("./app");
const prisma = require("./config/prisma");
const { port } = require("./config/env");
const { startBackupScheduler } = require("./services/backupService");
const { startInventoryIntegrityMonitor } = require("./services/inventoryIntegrityService");
const { logger } = require("./utils/logger");
const { initSentry } = require("./utils/sentry");

initSentry();

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
