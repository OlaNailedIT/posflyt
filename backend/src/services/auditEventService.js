const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { AUDIT_TYPES_REQUIRING_CORRELATION } = require("../config/auditEventTypes");

function isUuidString(s) {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim())
  );
}

/**
 * Ensures SALE / RETURN / PAYMENT_CAPTURED always have a correlation id (legacy clients / outbox).
 */
function resolveCorrelationIdIngest(e) {
  const raw = e.correlationId;
  if (typeof raw === "string" && isUuidString(raw)) return raw.trim();
  if (AUDIT_TYPES_REQUIRING_CORRELATION.has(String(e.type))) return randomUUID();
  return null;
}

/**
 * Insert-only; duplicate ids are ignored (sync replay safe).
 * @param {string} businessId
 * @param {string} actorId — server-trusted (JWT); overrides any client actor field
 * @param {object[]} events
 */
async function bulkIngestAuditEvents(businessId, actorId, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { inserted: 0, skipped: 0 };
  }
  const rows = events.map((e) => ({
    id: String(e.id),
    businessId,
    type: String(e.type),
    actorId,
    deviceId: String(e.deviceId || "unknown"),
    entityType: String(e.entityType),
    entityId: String(e.entityId),
    action: String(e.action),
    before: e.before ?? undefined,
    after: e.after ?? undefined,
    source: String(e.source || "unknown"),
    metadata: e.metadata ?? undefined,
    correlationId: resolveCorrelationIdIngest(e),
  }));

  const result = await prisma.auditEvent.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { inserted: result.count, skipped: rows.length - result.count };
}

module.exports = { bulkIngestAuditEvents };
