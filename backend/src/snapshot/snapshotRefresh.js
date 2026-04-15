/**
 * Phase 5 — non-blocking snapshot refresh after integrity writes.
 */
const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { buildSnapshot } = require("./snapshotEngine");

/**
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
function scheduleSnapshotRefresh(businessId, clientTransactionId) {
  setImmediate(() => {
    buildSnapshot(prisma, businessId, clientTransactionId).catch((err) => {
      logger.error(
        { err, businessId, clientTransactionId },
        "IntegritySnapshot refresh failed (events still authoritative)"
      );
    });
  });
}

module.exports = { scheduleSnapshotRefresh };
