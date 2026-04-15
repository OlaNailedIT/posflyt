/**
 * Phase 8 — snapshots stay **region-local**; global view is derived only.
 * Single-region: coherence is trivially satisfied when one writer exists.
 */

/**
 * @param {{ regionId?: string, snapshotRow?: object|null }} local
 */
function assertRegionLocalSnapshot(local) {
  const rid = local.regionId || "unknown";
  return {
    regionLocal: true,
    regionId: rid,
    note: "IntegritySnapshot rows never cross regions; global merge is read-time aggregation only.",
  };
}

/**
 * Deterministic ordering hint for cross-region merge (future): clientTimestampMs / eventId.
 * @param {Array<{ clientTimestampMs?: bigint|string|null, eventId?: string }>} events
 */
function mergeOrderingKey(events) {
  return [...(events || [])].sort((a, b) => {
    const ta = a.clientTimestampMs != null ? String(a.clientTimestampMs) : "";
    const tb = b.clientTimestampMs != null ? String(b.clientTimestampMs) : "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
}

module.exports = {
  assertRegionLocalSnapshot,
  mergeOrderingKey,
};
