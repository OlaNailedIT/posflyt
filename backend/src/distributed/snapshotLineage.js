/**
 * Phase 8.4 — merge-safe snapshot lineage without a new DB column (uses existing eventCount + lastEventId).
 */

/**
 * @param {{
 *   eventCount?: number,
 *   lastEventId?: string | null,
 * } | null | undefined} row
 * @param {string} regionId
 */
function buildSnapshotLineage(row, regionId) {
  if (!row) {
    return {
      snapshotVersion: 0,
      lastEventId: null,
      regionId: String(regionId || ""),
    };
  }
  return {
    snapshotVersion: Math.max(0, Number(row.eventCount) || 0),
    lastEventId: row.lastEventId ?? null,
    regionId: String(regionId || ""),
  };
}

/**
 * Only merge regional rows when lineage is strictly ordered (same region plane).
 * @param {Array<{ snapshotVersion: number, regionId: string }>} lineages
 */
function lineageMergeAllowed(lineages) {
  const list = Array.isArray(lineages) ? lineages : [];
  if (list.length <= 1) return { ok: true, reason: null };
  const versions = new Set(list.map((l) => l.snapshotVersion));
  if (versions.size > 1) {
    return { ok: false, reason: "SNAPSHOT_VERSION_MISMATCH" };
  }
  const regions = new Set(list.map((l) => l.regionId));
  if (regions.size > 1) {
    return { ok: false, reason: "CROSS_REGION_LINEAGE_WITHOUT_COORDINATION" };
  }
  return { ok: true, reason: null };
}

module.exports = {
  buildSnapshotLineage,
  lineageMergeAllowed,
};
