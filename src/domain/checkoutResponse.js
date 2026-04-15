/**
 * Bulk POST /transactions response helpers (idempotent client_transaction_id).
 * @param {unknown} response - unwrapped API body
 */
const ALLOWED_CONTRACT_VERSIONS = new Set([1, 2]);

/**
 * Strict envelope for POST /transactions (after `unwrap`). Throws if unusable.
 * @param {unknown} body
 */
export function normalizeTransactionBulkResponse(body) {
  if (!body || typeof body !== "object") {
    const err = new Error("Invalid transaction response");
    err.code = "INVALID_TRANSACTION_RESPONSE";
    throw err;
  }
  const v = /** @type {{ contractVersion?: number; results?: unknown }} */ (body).contractVersion;
  if (v != null && !ALLOWED_CONTRACT_VERSIONS.has(v)) {
    const err = new Error("Unsupported transaction response contract");
    err.code = "UNSUPPORTED_TRANSACTION_CONTRACT";
    throw err;
  }
  const results = /** @type {{ results?: unknown }} */ (body).results;
  if (!Array.isArray(results)) {
    const err = new Error("Invalid transaction response");
    err.code = "INVALID_TRANSACTION_RESPONSE";
    throw err;
  }
  return /** @type {Record<string, unknown> & { results: unknown[] }} */ (body);
}

export function firstAcceptedTransactionResult(response) {
  const results = response?.results;
  if (!Array.isArray(results)) return null;
  return (
    results.find((r) => r && (r.status === "created" || r.status === "duplicate")) || null
  );
}

/** Receipt envelope when present on created or duplicate rows. */
export function receiptFromAcceptedResult(accepted) {
  if (!accepted || typeof accepted !== "object") return null;
  return accepted.receipt ?? null;
}
