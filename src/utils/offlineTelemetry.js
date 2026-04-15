import { nowISOString } from "./safeDate.js";

/**
 * Structured offline-queue / sync events (migration, observability). Same shape as checkout telemetry.
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
export function emitOfflineTelemetry(event, payload = {}) {
  const row = {
    domain: "offline",
    event,
    ts: nowISOString(),
    ...payload,
  };
  if (import.meta.env.DEV) {
    console.info("[OFFLINE]", row);
  } else {
    console.info(JSON.stringify(row));
  }
}
