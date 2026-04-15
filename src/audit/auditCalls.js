import { writeAuditEvent } from "./auditWriter";
import { useAuthStore } from "../stores/authStore";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_EVENT_TYPES } from "./auditEventTypes";

/** @param {{ transactionId?: string, clientTransactionId: string, total: number, channel: string, duplicate?: boolean, offlineQueued?: boolean, correlationId?: string }} p */
export function auditSaleCreated(p) {
  const id = p.transactionId || p.clientTransactionId;
  void writeAuditEvent({
    type: AUDIT_EVENT_TYPES.SALE_CREATED,
    correlationId: p.correlationId,
    entity: { type: AUDIT_ENTITY_TYPES.TRANSACTION, id },
    action: AUDIT_ACTIONS.CREATE,
    before: null,
    after: {
      totalAmount: p.total,
      clientTransactionId: p.clientTransactionId,
      duplicate: Boolean(p.duplicate),
      offlineQueued: Boolean(p.offlineQueued),
      channel: p.channel,
    },
    metadata: { channel: p.channel },
  });
}

/** @param {{ returnClientEventId: string, originalTransactionId: string, queued?: boolean, correlationId?: string }} p */
export function auditReturnCreated(p) {
  void writeAuditEvent({
    type: AUDIT_EVENT_TYPES.RETURN_CREATED,
    correlationId: p.correlationId,
    entity: { type: AUDIT_ENTITY_TYPES.TRANSACTION, id: p.originalTransactionId },
    action: AUDIT_ACTIONS.CREATE,
    before: null,
    after: {
      originalTransactionId: p.originalTransactionId,
      clientEventId: p.returnClientEventId,
      queued: Boolean(p.queued),
    },
    metadata: {},
  });
}

/** @param {{ productId: string, before: object, after: object, correlationId?: string }} p */
export function auditInventoryUpdated(p) {
  void writeAuditEvent({
    type: AUDIT_EVENT_TYPES.INVENTORY_UPDATED,
    correlationId: p.correlationId,
    entity: { type: AUDIT_ENTITY_TYPES.INVENTORY, id: p.productId },
    action: AUDIT_ACTIONS.UPDATE,
    before: p.before,
    after: p.after,
    metadata: {},
  });
}

/** @param {{ productId: string, name: string, correlationId?: string }} p */
export function auditInventoryCreated(p) {
  void writeAuditEvent({
    type: AUDIT_EVENT_TYPES.INVENTORY_CREATED,
    correlationId: p.correlationId,
    entity: { type: AUDIT_ENTITY_TYPES.INVENTORY, id: p.productId },
    action: AUDIT_ACTIONS.CREATE,
    before: null,
    after: { name: p.name },
    metadata: {},
  });
}

/** @param {{ method: string }} p */
export function auditAuthLogin(p) {
  const uid = useAuthStore.getState().user?.id || "unknown";
  void writeAuditEvent({
    type: AUDIT_EVENT_TYPES.AUTH_LOGIN,
    entity: { type: AUDIT_ENTITY_TYPES.STAFF, id: uid },
    action: AUDIT_ACTIONS.LOGIN,
    before: null,
    after: { method: p.method },
    metadata: { method: p.method },
  });
}
