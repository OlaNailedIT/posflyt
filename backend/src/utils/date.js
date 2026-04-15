/**
 * Backend date contract: no unsafe `Invalid Date#toISOString()`; consistent ISO output for API layers.
 */

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function toSafeISOString(input) {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * @returns {string}
 */
function nowISOString() {
  return new Date().toISOString();
}

/**
 * UTC calendar key YYYY-MM-DD from a Date or parseable value.
 * @param {unknown} input
 * @returns {string | null}
 */
function toDateKeyUTC(input) {
  const iso = toSafeISOString(input);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Plain object check (skip Decimal, Buffer, etc. in generic walks).
 * @param {unknown} value
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep-clone JSON-like trees and convert `Date` leaves to ISO strings (invalid → null).
 * Skips non-plain objects (e.g. Prisma Decimal) to avoid corrupting typed values.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function normalizeDatesForJson(value, depth = 0) {
  if (depth > 12) return value;
  if (value == null) return value;
  if (value instanceof Date) {
    return toSafeISOString(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalizeDatesForJson(v, depth + 1));
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = normalizeDatesForJson(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

module.exports = {
  toSafeISOString,
  nowISOString,
  toDateKeyUTC,
  normalizeDatesForJson,
};
