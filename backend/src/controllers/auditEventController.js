const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { bulkIngestAuditEvents } = require("../services/auditEventService");
const {
  AUDIT_EVENT_TYPE_VALUES,
  AUDIT_ENTITY_TYPE_VALUES,
  AUDIT_ACTION_VALUES,
} = require("../config/auditEventTypes");

const MAX_AUDIT_JSON_BYTES = 24_000;

function assertJsonPayloadSize(label, val, ctx) {
  if (val == null) return;
  try {
    const n = JSON.stringify(val).length;
    if (n > MAX_AUDIT_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} exceeds ${MAX_AUDIT_JSON_BYTES} bytes`,
      });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is not JSON-serializable` });
  }
}

/** @type {[string, ...string[]]} */
const EVENT_TYPES = /** @type {any} */ ([...AUDIT_EVENT_TYPE_VALUES]);
/** @type {[string, ...string[]]} */
const ENTITY_TYPES = /** @type {any} */ ([...AUDIT_ENTITY_TYPE_VALUES]);
/** @type {[string, ...string[]]} */
const ACTIONS = /** @type {any} */ ([...AUDIT_ACTION_VALUES]);

const eventSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(EVENT_TYPES),
    deviceId: z.string().min(1).max(128),
    entityType: z.enum(ENTITY_TYPES),
    entityId: z.string().trim().min(1).max(128),
    action: z.enum(ACTIONS),
    before: z.any().nullable().optional(),
    after: z.any().nullable().optional(),
    source: z.enum(["online", "offline", "unknown"]),
    metadata: z.any().optional().nullable(),
    correlationId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    assertJsonPayloadSize("before", row.before, ctx);
    assertJsonPayloadSize("after", row.after, ctx);
    assertJsonPayloadSize("metadata", row.metadata, ctx);
  });

const bulkSchema = z
  .object({
    events: z.array(eventSchema).min(1).max(50),
  })
  .strict();

async function postAuditEventsBulk(req, res, next) {
  try {
    const data = bulkSchema.parse(req.body);
    const result = await bulkIngestAuditEvents(req.auth.businessId, req.auth.userId, data.events);
    return sendOk(res, result, 200);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/auditEventController.postAuditEventsBulk",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { postAuditEventsBulk };
