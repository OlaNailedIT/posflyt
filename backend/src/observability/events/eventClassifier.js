/**
 * Maps integrity event `type` strings to canonical observability stage labels (Phase 6 explainability).
 */

const STAGE_BY_PREFIX = [
  { prefix: "SALE_QUEUED", stage: "SALE_QUEUED_OFFLINE" },
  { prefix: "OFFLINE", stage: "SALE_QUEUED_OFFLINE" },
  { prefix: "SYNC", stage: "SYNC_REPLAY" },
  { prefix: "REPLAY", stage: "SYNC_REPLAY" },
  { prefix: "SALE_APPLIED", stage: "SALE_APPLIED" },
  { prefix: "APPLIED", stage: "SALE_APPLIED" },
  { prefix: "SNAPSHOT", stage: "SNAPSHOT_UPDATED" },
  { prefix: "INGEST", stage: "EVENT_INGESTED" },
  { prefix: "RETURN", stage: "RETURN_EVENT_APPLIED" },
];

/** Canonical order for the pipeline diagram (subset may be present per transaction). */
const PIPELINE_ORDER = [
  "EVENT_INGESTED",
  "SALE_QUEUED_OFFLINE",
  "SYNC_REPLAY",
  "SALE_APPLIED",
  "LEDGER_PROJECTED",
  "SNAPSHOT_UPDATED",
  "RECONCILIATION_CHECKED",
];

/**
 * @param {string} [type]
 * @returns {string}
 */
function classifyIntegrityEventStage(type) {
  const t = String(type || "").toUpperCase();
  if (!t) return "INTEGRITY_EVENT";
  for (const { prefix, stage } of STAGE_BY_PREFIX) {
    if (t.startsWith(prefix)) return stage;
  }
  return t.replace(/\s+/g, "_");
}

/**
 * Ordered presence-only pipeline for UI flow (Event → … → Reconciliation).
 * @param {string[]} presentStages — stages known to apply to this scope
 * @returns {string[]}
 */
function orderPipelineStages(presentStages) {
  const set = new Set(presentStages || []);
  return PIPELINE_ORDER.filter((s) => set.has(s));
}

/**
 * Deduplicated timeline from chronological events.
 * @param {Array<{ type?: string }>} sortedEvents
 * @returns {string[]}
 */
function buildTimelineStages(sortedEvents) {
  const labels = [];
  const seen = new Set();
  for (const e of sortedEvents || []) {
    const stage = classifyIntegrityEventStage(e?.type);
    if (!seen.has(stage)) {
      seen.add(stage);
      labels.push(stage);
    }
  }
  return labels;
}

module.exports = {
  PIPELINE_ORDER,
  classifyIntegrityEventStage,
  orderPipelineStages,
  buildTimelineStages,
};
