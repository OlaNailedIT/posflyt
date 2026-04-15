/**
 * Phase 8 — deterministic derived global numbers from regional snapshot fragments.
 * Single-region: one “regional” slice equals the live tenant totals.
 */

/**
 * @param {Array<{ regionId: string, balanceSum: number }>} regionalSlices
 */
function computeGlobalBalance(regionalSlices) {
  const rows = Array.isArray(regionalSlices) ? regionalSlices : [];
  const total = rows.reduce((s, r) => s + Number(r.balanceSum || 0), 0);
  return {
    globalBalance: Math.round(total * 1e6) / 1e6,
    regionsContributing: rows.length,
    byRegion: Object.fromEntries(rows.map((r) => [r.regionId, r.balanceSum])),
  };
}

/**
 * @param {Array<{ regionId: string, eventCount: number }>} regionalSnapshots
 */
function mergeSnapshotFootprints(regionalSnapshots) {
  const rows = Array.isArray(regionalSnapshots) ? regionalSnapshots : [];
  return {
    totalEventSlotsObserved: rows.reduce((s, r) => s + Number(r.eventCount || 0), 0),
    byRegion: rows,
  };
}

module.exports = {
  computeGlobalBalance,
  mergeSnapshotFootprints,
};
