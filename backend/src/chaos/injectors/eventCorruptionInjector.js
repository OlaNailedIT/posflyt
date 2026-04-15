/**
 * Safe corruption **simulation** — does not write bad data to DB unless future destructive mode.
 * Validates that mismatched hashes would be rejected (mirrors ingest rules).
 */
const crypto = require("crypto");
const { stableStringify } = require("../../utils/stableStringify");

function sha256Hex(obj) {
  return crypto.createHash("sha256").update(stableStringify(obj), "utf8").digest("hex");
}

/**
 * Demonstrates idempotency: altered payload ⇒ different hash (caller can assert mismatch).
 */
function syntheticPayloadTamper(originalPayload) {
  const mutated = { ...originalPayload, __chaos: true };
  return {
    originalHash: sha256Hex(originalPayload),
    mutatedHash: sha256Hex(mutated),
    wouldMismatch: true,
  };
}

module.exports = {
  sha256Hex,
  syntheticPayloadTamper,
};
