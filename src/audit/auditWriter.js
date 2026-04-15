import { enqueueOutbox } from "../services/db";
import { getOrCreateDeviceId } from "../offline/deviceCrypto";
import { useAuthStore } from "../stores/authStore";
import { createCorrelationId } from "./auditCorrelation";
import { AUDIT_EVENT_TYPES, isAuditAction, isAuditEntityType, isAuditEventType } from "./auditEventTypes";

function parseCorrelationId(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Append-only accountability event → local outbox → sync → server AuditEvent table.
 * Never throws into callers; failures are silent (truth layer must not break UFEC / checkout).
 *
 * @param {object} partial
 * @param {string} partial.type
 * @param {{ type: string, id: string }} partial.entity
 * @param {string} partial.action
 * @param {object|null} [partial.before]
 * @param {object|null} [partial.after]
 * @param {Record<string, unknown>} [partial.metadata]
 * @param {string} [partial.correlationId]
 * @returns {Promise<object|null>}
 */
export async function writeAuditEvent(partial) {
  try {
    const user = useAuthStore.getState().user;
    if (!user?.id) return null;

    if (!isAuditEventType(partial.type) || !isAuditAction(partial.action)) return null;

    let correlationId = parseCorrelationId(partial.correlationId);
    if (!correlationId) {
      correlationId = partial.type === AUDIT_EVENT_TYPES.AUTH_LOGIN ? null : createCorrelationId();
    }

    const entityTypeRaw = partial.entity?.type ? String(partial.entity.type) : "unknown";
    const entityType = isAuditEntityType(entityTypeRaw) ? entityTypeRaw : "unknown";
    if (entityType === "unknown" && entityTypeRaw !== "unknown") return null;

    const entityId =
      partial.entity?.id != null && String(partial.entity.id).trim() !== ""
        ? String(partial.entity.id).trim()
        : "";
    if (!entityId) return null;

    const id = crypto.randomUUID();
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const event = {
      id,
      type: partial.type,
      deviceId: getOrCreateDeviceId(),
      entityType,
      entityId,
      action: partial.action,
      before: partial.before ?? null,
      after: partial.after ?? null,
      source: online ? "online" : "offline",
      metadata: {
        ...(partial.metadata && typeof partial.metadata === "object" ? partial.metadata : {}),
        actorName: user.name,
        role: user.role,
        timestamp: new Date().toISOString(),
      },
    };
    if (correlationId != null) {
      event.correlationId = correlationId;
    }

    await enqueueOutbox({ kind: "AUDIT_EVENT", body: event });
    return event;
  } catch {
    return null;
  }
}
