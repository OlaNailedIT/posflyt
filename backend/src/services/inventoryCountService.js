const { nowISOString } = require("../utils/date.js");
const prisma = require("../config/prisma");
const { logAudit } = require("./auditService");
const { logger } = require("../utils/logger");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { isFeatureEnabled } = require("./featureFlagService");

async function assertInventoryCountEnabled(businessId) {
  const sub = await ensureBusinessSubscription(businessId);
  const allowed = await isFeatureEnabled(businessId, sub.plan, "INVENTORY_COUNT_MODE");
  if (!allowed) {
    const err = new Error("Inventory count mode is not enabled for this workspace");
    err.statusCode = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }
  return sub;
}

/**
 * Apply counted quantities as authoritative stock (Phase 7.11.4).
 * @param {string} businessId
 * @param {string} userId
 * @param {{ sessionId: string, lines: Array<{ productId: string, countedQty: number }>, scanCountsByProductId?: Record<string, number> }} payload
 */
async function applyInventoryCountSession(businessId, userId, payload) {
  await assertInventoryCountEnabled(businessId);
  const { sessionId, lines, scanCountsByProductId } = payload;
  if (!lines?.length) {
    const err = new Error("At least one line is required");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }
  if (lines.length > 500) {
    const err = new Error("Too many lines in one session");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      const countedQty = Number(line.countedQty);
      if (!Number.isFinite(countedQty) || countedQty < 0) {
        const err = new Error("Invalid counted quantity");
        err.statusCode = 400;
        err.code = "VALIDATION_FAILED";
        throw err;
      }
      const p = await tx.product.findFirst({
        where: { id: line.productId, businessId },
      });
      if (!p) {
        const err = new Error(`Product not found: ${line.productId}`);
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: countedQty },
      });
    }
  });

  await logAudit({
    businessId,
    userId,
    action: "INVENTORY_COUNT_SESSION_FINALIZED",
    metadata: {
      sessionId,
      lineCount: lines.length,
      scanCountsByProductId: scanCountsByProductId || null,
    },
  });

  logger.info(
    {
      event: "INVENTORY_COUNT_SESSION_FINALIZED",
      inventoryCountMode: true,
      businessId,
      sessionId,
      lineCount: lines.length,
      scanCountsByProductId: scanCountsByProductId || null,
    },
    "inventory count session finalized"
  );
  if (scanCountsByProductId && Object.keys(scanCountsByProductId).length) {
    logger.info(
      {
        event: "INVENTORY_COUNT_SCAN_SUMMARY",
        inventoryCountMode: true,
        sessionId,
        scanCountsByProductId,
      },
      "per-product scan counts in count mode"
    );
  }

  return { lineCount: lines.length, sessionId };
}

/**
 * Lightweight lifecycle logging (start / pause / resume).
 */
async function logSessionEvent(businessId, userId, payload) {
  await assertInventoryCountEnabled(businessId);
  const { type, sessionId } = payload;
  if (!sessionId) {
    const err = new Error("sessionId is required");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }
  const events = {
    session_started: "INVENTORY_COUNT_SESSION_STARTED",
    session_paused: "INVENTORY_COUNT_SESSION_PAUSED",
    session_resumed: "INVENTORY_COUNT_SESSION_RESUMED",
  };
  const eventName = events[type];
  if (!eventName) {
    const err = new Error("Invalid session event type");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }
  logger.info(
    {
      event: eventName,
      inventoryCountMode: true,
      businessId,
      sessionId,
      userId,
      timestamp: nowISOString(),
    },
    "inventory count session event"
  );
  return { ok: true };
}

module.exports = { applyInventoryCountSession, logSessionEvent };
