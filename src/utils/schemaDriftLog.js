/**
 * Centralized schema / storage drift signals (IndexedDB, API expectations, etc.).
 * Use for early warning — not user-facing error copy.
 *
 * `read_fallback` (IndexedDB missing store → empty result) is an expected resilience path;
 * it stays quiet in production and does not spam Sentry.
 *
 * Session `driftCount` is product/debug intelligence: rare = normal; climbing fast = investigate.
 */
import * as Sentry from "@sentry/react";
import { nowISOString } from "./safeDate.js";

let driftCount = 0;

/** Cumulative schema-drift signals this session (every `logSchemaDrift` call increments). */
export function getSchemaDriftCount() {
  return driftCount;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  let lastDevHighDriftWarnAt = 0;
  setInterval(() => {
    const n = driftCount;
    if (n > 5 && n !== lastDevHighDriftWarnAt) {
      console.warn("⚠️ High schema drift this session — investigate IndexedDB upgrade path or clear site data if stuck:", n);
      lastDevHighDriftWarnAt = n;
    }
  }, 10_000);
}

/**
 * @param {Record<string, unknown>} details
 * @param {{ captureSentry?: boolean }} [opts]
 */
export function logSchemaDrift(details, opts = {}) {
  driftCount += 1;
  if (typeof window !== "undefined") {
    window.__SCHEMA_DRIFT_COUNT__ = driftCount;
  }

  const payload = {
    category: "SCHEMA_DRIFT",
    ts: nowISOString(),
    ...details,
  };
  const isReadFallback = details.kind === "read_fallback";
  const captureSentry = opts.captureSentry ?? !isReadFallback;

  if (import.meta.env.DEV) {
    if (isReadFallback) {
      console.debug("[SCHEMA_DRIFT]", payload);
    } else {
      console.warn("[SCHEMA_DRIFT]", payload);
    }
  }
  if (captureSentry && import.meta.env.VITE_SENTRY_DSN) {
    try {
      Sentry.captureMessage("Schema drift", { level: "warning", extra: { ...payload, driftCount } });
    } catch {
      // Sentry optional
    }
  }
}
