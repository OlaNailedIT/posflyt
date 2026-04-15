const { logger } = require("./logger");

/**
 * Server-side drift signals (Prisma vs DB, migration lag, etc.).
 * @param {Record<string, unknown>} details
 */
function logSchemaDrift(details) {
  logger.warn(
    {
      category: "SCHEMA_DRIFT",
      ...details,
    },
    "schema drift signal"
  );
}

module.exports = { logSchemaDrift };
