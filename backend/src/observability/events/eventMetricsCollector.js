/**
 * Hooks for future ingest/projection/reconcile emitters. Aggregates are computed in
 * `metrics/financialMetricsEngine.js` from DB truth today.
 */

/**
 * Placeholder counter names for documentation / future Prometheus wiring.
 */
const OBS_COUNTERS = {
  INGEST_OK: "vessa_obs_ingest_ok",
  PROJECTION_OK: "vessa_obs_projection_ok",
  RECONCILE_PASS: "vessa_obs_reconcile_pass",
  RECONCILE_FAIL: "vessa_obs_reconcile_fail",
};

module.exports = {
  OBS_COUNTERS,
};
