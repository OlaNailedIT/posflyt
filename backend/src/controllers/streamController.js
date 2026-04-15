const { nowISOString } = require("../utils/date.js");
/**
 * Phase 6.5 — read in-memory stream buffer (admin / ops). Not a durable Kafka log.
 */
const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { replayEvents } = require("../streaming/replay/eventReplayEngine");
const { getEventBus } = require("../streaming/eventBus/eventBus");
const { getStreamTypeCounts } = require("../streaming/subscribers/registerDefaultSubscribers");

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sinceMs: z.coerce.number().optional(),
  types: z.string().optional(),
});

async function getStreamRecent(req, res, next) {
  try {
    const q = querySchema.parse(req.query);
    const types = q.types
      ? q.types
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const data = replayEvents({
      businessId: req.auth.businessId,
      limit: q.limit ?? 80,
      sinceMs: q.sinceMs,
      types,
    });
    return sendOk(res, {
      events: data,
      stats: getEventBus().snapshotStats(),
      typeCounts: getStreamTypeCounts(),
    });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "streamController.getStreamRecent",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function getStreamStats(req, res, next) {
  try {
    return sendOk(res, {
      bus: getEventBus().snapshotStats(),
      typeCounts: getStreamTypeCounts(),
      generatedAt: nowISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getStreamRecent,
  getStreamStats,
};
