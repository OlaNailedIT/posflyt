/**
 * Offline-safe correlation ids (UUID v4) for linking audit events to one business action.
 */
export function createCorrelationId() {
  return crypto.randomUUID();
}
