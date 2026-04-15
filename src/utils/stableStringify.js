/**
 * Deterministic JSON for hashing (sorted object keys, stable arrays).
 * @param {unknown} value
 */
export function stableStringify(value) {
  if (value === null || typeof value === "undefined") return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(/** @type {Record<string, unknown>} */ (value)[k])}`).join(",")}}`;
}
