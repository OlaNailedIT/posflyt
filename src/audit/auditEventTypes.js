/**
 * Contract for append-only audit payloads — keep in sync with `backend/src/config/auditEventTypes.js`.
 */
export const AUDIT_EVENT_TYPES = Object.freeze({
  SALE_CREATED: "SALE_CREATED",
  RETURN_CREATED: "RETURN_CREATED",
  INVENTORY_CREATED: "INVENTORY_CREATED",
  INVENTORY_UPDATED: "INVENTORY_UPDATED",
  AUTH_LOGIN: "AUTH_LOGIN",
  /** Reserved: payment capture / settlement (emit when wired). */
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  /** Reserved: sync / replay lineage (emit when wired). */
  SYNC: "SYNC",
});

/** Standard payload field names (documentation + shared imports). */
export const AUDIT_FIELDS = Object.freeze({
  CORRELATION_ID: "correlationId",
});

/** entity.type sent to the server (no free-form strings in call sites). */
export const AUDIT_ENTITY_TYPES = Object.freeze({
  TRANSACTION: "transaction",
  INVENTORY: "inventory",
  STAFF: "staff",
});

export const AUDIT_ACTIONS = Object.freeze({
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  LOGIN: "LOGIN",
});

const _typeValues = Object.values(AUDIT_EVENT_TYPES);
const _entityValues = Object.values(AUDIT_ENTITY_TYPES);
const _actionValues = Object.values(AUDIT_ACTIONS);

/** @type {ReadonlySet<string>} */
export const AUDIT_EVENT_TYPE_SET = new Set(_typeValues);
/** @type {ReadonlySet<string>} */
export const AUDIT_ENTITY_TYPE_SET = new Set(_entityValues);
/** @type {ReadonlySet<string>} */
export const AUDIT_ACTION_SET = new Set(_actionValues);

/** @param {unknown} t */
export function isAuditEventType(t) {
  return typeof t === "string" && AUDIT_EVENT_TYPE_SET.has(t);
}

/** @param {unknown} t */
export function isAuditEntityType(t) {
  return typeof t === "string" && AUDIT_ENTITY_TYPE_SET.has(t);
}

/** @param {unknown} a */
export function isAuditAction(a) {
  return typeof a === "string" && AUDIT_ACTION_SET.has(a);
}
