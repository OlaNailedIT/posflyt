const { PrismaClient } = require("@prisma/client");
const { databaseReadUrl } = require("./env");
const { logger } = require("../utils/logger");

/**
 * Phase 9: optional read replica for analytics (same schema as primary).
 * Use for heavy SELECTs only; fall back to primary when unset.
 */
let readClient;

function getReadPrisma() {
  if (!databaseReadUrl) return null;
  if (!readClient) {
    /** Read replica only — never fall back to DATABASE_URL here. */
    readClient = new PrismaClient({
      datasources: { db: { url: databaseReadUrl } },
    });
    logger.info("Prisma read replica client initialized");
  }
  return readClient;
}

async function disconnectReadPrisma() {
  if (readClient) {
    await readClient.$disconnect();
    readClient = null;
  }
}

module.exports = { getReadPrisma, disconnectReadPrisma };
