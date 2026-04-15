/**
 * Defensive date parsing for API/UI values that may be null, "", or invalid in production.
 * Avoids RangeError from Invalid Date#toISOString().
 */

/** @param {unknown} value @returns {value is Date} */
export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** @param {unknown} value @returns {Date | null} */
export function parseDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isValidDate(d) ? d : null;
}

/** @param {unknown} value @returns {string | null} */
export function safeToISOString(value) {
  const d = parseDate(value);
  return d ? d.toISOString() : null;
}

/** @param {unknown} value @param {string} [fallback="—"] @returns {string} */
export function formatDateTimeLocale(value, fallback = "—") {
  const d = parseDate(value);
  return d ? d.toLocaleString() : fallback;
}

/**
 * Current instant as ISO-8601 UTC. Use this instead of `new Date().toISOString()` so all
 * serialization goes through one module (easier audit; same behavior).
 * @returns {string}
 */
export function nowISOString() {
  return new Date().toISOString();
}

/**
 * Canonical field names we treat as dates when normalizing API JSON (in-place).
 * Add keys here as new date fields appear in the API contract.
 */
export const KNOWN_DATE_FIELD_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "deletedAt",
  "created_at",
  "updated_at",
  "dueDate",
  "due_date",
  "dateTime",
  "date_time",
  "closedAt",
  "trialEndsAt",
  "graceEndsAt",
  "lastActivityAt",
  "alertDate",
  "timestamp",
  "expiresAt",
  "paidAt",
  "lastSeenAt",
  "lastSyncedAt",
  "lastSuccessfulSyncAt",
  "lastAttemptAt",
  "nextRetryAt",
  "startedAt",
  "finishedAt",
  "exportedAt",
  "capturedAt",
  "syncedAt",
  "closed_at",
  "startOfDay",
  "endOfDay",
  "processedAt",
  "processed_at",
  "paid_at",
  "bucketStart",
  "bucket_start",
  "date",
]);

/**
 * @param {string} context
 * @param {unknown} raw
 */
export function warnInvalidDateInputInDev(context, raw) {
  if (!import.meta.env.DEV) return;
  if (raw == null || raw === "") return;
  if (parseDate(raw) != null) return;
  // eslint-disable-next-line no-console
  console.warn(`[safeDate] invalid date stored or received (${context}):`, raw);
}

/**
 * `""` / invalid → `null`; valid → ISO UTC string.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeNullableIso(value) {
  if (value === "" || value === undefined) return null;
  if (value == null) return null;
  const iso = safeToISOString(value);
  if (iso == null && String(value).length > 0) {
    warnInvalidDateInputInDev("normalizeNullableIso", value);
  }
  return iso;
}

/** ISO-8601-style strings we treat as date candidates (new backend keys without updating the allowlist). */
const ISO_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}T/;
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True if `s` looks like an ISO/RFC3339 date string (not UUIDs, not plain integers).
 * @param {unknown} s
 */
export function looksLikeDateString(s) {
  if (typeof s !== "string") return false;
  const len = s.length;
  if (len < 10 || len > 120) return false;
  if (ISO_DATE_PREFIX_RE.test(s)) return true;
  if (len === 10 && ISO_DATE_ONLY_RE.test(s)) return true;
  return false;
}

/**
 * Whether a JSON key name is eligible for **value-based** ISO heuristics (unknown keys only).
 * Intent-based only (no bare `"time"` substring — avoids `timeout`, `timeLimit`, etc.).
 * Prevents corrupting `sku: "2026-01-01"`-style product codes.
 * @param {string} key
 */
export function keyLooksDateRelated(key) {
  if (typeof key !== "string" || key.length === 0) return false;
  const lower = key.toLowerCase();
  if (lower.includes("date")) return true;
  if (lower.includes("timestamp")) return true;
  if (lower.includes("created")) return true;
  if (lower.includes("updated")) return true;
  if (lower.includes("due")) return true;
  if (lower.includes("start")) return true;
  if (lower.includes("end")) return true;
  if (key.endsWith("At")) return true;
  if (lower.endsWith("_at")) return true;
  return false;
}

/**
 * Heuristic: normalize a string that looks date-like; only when key passed {@link keyLooksDateRelated}.
 * @param {string} s
 * @param {string} context
 * @returns {string | null | undefined} `undefined` = leave value unchanged (not date-shaped)
 */
function heuristicNormalizeDateString(s, context) {
  if (!looksLikeDateString(s)) return undefined;
  const iso = safeToISOString(s);
  if (iso == null) {
    warnInvalidDateInputInDev(`${context} (date-like but invalid)`, s);
    return null;
  }
  return iso;
}

/**
 * Recursively normalize date fields on API JSON (mutates objects in place).
 *
 * 1. Keys in {@link KNOWN_DATE_FIELD_KEYS} — always normalized (values coerced to ISO or null).
 * 2. Other keys — value-based ISO heuristics **only** if {@link keyLooksDateRelated}.
 * 3. Arrays — no string heuristic on bare elements (could be SKU lists); recurse into objects only.
 * 4. Numbers — left as-is (epoch ms stay numeric).
 *
 * @param {unknown} root
 * @param {number} [depth]
 */
export function normalizeApiDateFieldsDeep(root, depth = 0) {
  if (depth > 14 || root == null) return;
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i += 1) {
      const el = root[i];
      if (el != null && typeof el === "object") normalizeApiDateFieldsDeep(el, depth + 1);
    }
    return;
  }
  if (typeof root !== "object") return;

  for (const key of Object.keys(root)) {
    const v = root[key];
    if (KNOWN_DATE_FIELD_KEYS.has(key)) {
      if (v === "" || v === undefined) {
        root[key] = null;
      } else if (v != null) {
        const iso = safeToISOString(v);
        if (iso == null && String(v).length > 0) {
          warnInvalidDateInputInDev(`response.${key}`, v);
        }
        root[key] = iso;
      }
    } else if (typeof v === "string" && keyLooksDateRelated(key)) {
      const n = heuristicNormalizeDateString(v, `response.${key}`);
      if (n !== undefined) root[key] = n;
    } else if (v != null && typeof v === "object") {
      normalizeApiDateFieldsDeep(v, depth + 1);
    }
  }
}
