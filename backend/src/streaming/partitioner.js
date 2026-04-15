/**
 * Partition key for ordering & future sharding (Phase 8). Single-node in-memory bus uses this for grouping.
 * @param {string} businessId
 * @param {string} [clientTransactionId]
 * @returns {string}
 */
function partitionKey(businessId, clientTransactionId) {
  const b = String(businessId || "").trim();
  const c = String(clientTransactionId || "").trim();
  if (!b) return "_none";
  if (!c) return `biz:${b}`;
  return `biz:${b}|tx:${c}`;
}

/**
 * Stable numeric lane 0..1023 for potential worker assignment (optional).
 */
function partitionLane(businessId, clientTransactionId) {
  const key = partitionKey(businessId, clientTransactionId);
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 1024;
}

module.exports = {
  partitionKey,
  partitionLane,
};
