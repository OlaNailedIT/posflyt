/**
 * Append-only audit event `type` whitelist — keep in sync with `src/audit/auditEventTypes.js`.
 */
const AUDIT_EVENT_TYPES = Object.freeze({
  SALE_CREATED: "SALE_CREATED",
  RETURN_CREATED: "RETURN_CREATED",
  INVENTORY_CREATED: "INVENTORY_CREATED",
  INVENTORY_UPDATED: "INVENTORY_UPDATED",
  AUTH_LOGIN: "AUTH_LOGIN",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  SYNC: "SYNC",
});

const AUDIT_EVENT_TYPE_VALUES = Object.freeze(Object.values(AUDIT_EVENT_TYPES));

const AUDIT_FIELDS = Object.freeze({
  CORRELATION_ID: "correlationId",
});

/** Types that should carry a correlation id for cross-system tracing (server may default if missing). */
const AUDIT_TYPES_REQUIRING_CORRELATION = Object.freeze(
  new Set([AUDIT_EVENT_TYPES.SALE_CREATED, AUDIT_EVENT_TYPES.RETURN_CREATED, AUDIT_EVENT_TYPES.PAYMENT_CAPTURED])
);

/** entityType values the client may send */
const AUDIT_ENTITY_TYPE_VALUES = Object.freeze([
  "transaction",
  "inventory",
  "staff",
  "unknown",
]);

const AUDIT_ACTION_VALUES = Object.freeze(["CREATE", "UPDATE", "DELETE", "LOGIN", "SYNC"]);

module.exports = {
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_TYPE_VALUES,
  AUDIT_ENTITY_TYPE_VALUES,
  AUDIT_ACTION_VALUES,
  AUDIT_FIELDS,
  AUDIT_TYPES_REQUIRING_CORRELATION,
};
