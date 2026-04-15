/**
 * Phase 2 Step 6–7 — Canonical UFEC execution + dominance contract (single path).
 *
 * All financial side-effects MUST go through:
 *   FinancialEvent → executeFinancialEvent → enforcement (Step 5) → legacy HTTP adapter
 *
 * Step 7: UFEC is the **only client-side financial decision system** (classification, validation
 * policy, enforcement, ledger expectation). Backend services are **LEGACY_ADAPTER_ONLY** execution
 * (persistence, integrity). See docs/UFEC_PHASE2_DOMINANCE.md
 *
 * Do not call `postTransaction` / `postTransactionReturn` from `api.js` directly; the router
 * authorizes those calls. Unguarded use logs `[UFEC_VIOLATION]`.
 *
 * Locked event kinds (see FINANCIAL_EVENT_TYPE): SALE_EVENT, RETURN_EVENT, ADJUSTMENT_EVENT (future),
 * OTHER_SYNC (non-UFEC outbox replay only). Operations that cannot be modeled as these are invalid design.
 */

export {
  isRepresentableFinancialEventType,
  UFEC_DOMINANCE_PHASE,
  UFEC_REPRESENTABLE_EVENT_KINDS,
} from "./ufecDominanceContract.js";
export { FINANCIAL_EVENT_TYPE } from "./ufecSyncShadow.js";
export {
  createReturnFinancialEvent,
  createSaleFinancialEvent,
  executeFinancialEvent,
  returnEventToLegacyApiBody,
  saleEventToLegacyApiBody,
} from "./executeFinancialEvent.js";
export { replayOutboxReturn, replayQueuedTransactionSale } from "./syncReplay.js";
export {
  getGlobalEventId,
  getSyncReplayIdempotencyDecision,
  IDEMPOTENCY_STATUS,
} from "./ufecIdempotencyRegistry.js";
export {
  CONVERGENCE_STATE,
  DRIFT_TYPE,
  evaluateLedgerConvergence,
} from "./ufecLedgerConvergence.js";
export {
  FSM_STATE,
  loadFinancialEventStateContextFromStores,
  resolveFinancialEventState,
  resolveFinancialEventStateFromStores,
} from "./ufecFinancialEventFsm.js";
export {
  repairFinancialEventConsistency,
  runConsistencyAuditForGlobalEvent,
  validateSystemConsistency,
  VIOLATION_TYPE,
} from "./ufecSystemConsistency.js";
export {
  commitIdempotencyAtomic,
  getUfecLeaseOwnerId,
  LEASE_TTL_MS,
  UFEC_WRITE_PRIORITY,
  UFEC_WRITE_SOURCE,
} from "./ufecConcurrency.js";
/** Phase 4 Step 2 — CFEOS: deterministic merge + device sequence (see ufecCanonicalOrder.js). */
export {
  attachCanonicalOrderToFinancialEvent,
  buildCanonicalOrderFields,
  computeGlobalOrderKey,
  hydrateCanonicalOrderFromQueueRow,
  resolveCanonicalEventOrder,
  UFEC_PRIORITY_WEIGHT,
} from "./ufecCanonicalOrder.js";
export { getNextDeviceSequenceCounter, getUfecDeviceId } from "./ufecDeviceSequence.js";
/** Phase 4 Step 3 — Sync storm backpressure (see ufecSyncBackpressure.js). */
export {
  evaluateSyncPressure,
  getAdaptiveConcurrency,
  getDynamicBatchSize,
  getSyntheticPauseMs,
  getThrottleDelayMs,
  isUfecSyncFreezeModeEnabled,
  resetSessionRetryBudget,
  tryConsumeSessionAttemptBudget,
  UFEC_SESSION_GLOBAL_ATTEMPT_CEILING,
  UFEC_SESSION_MAX_ATTEMPTS_PER_ROW,
  UFEC_SYNC_MODE,
  UFEC_SYNC_PRESSURE,
} from "./ufecSyncBackpressure.js";
/** Phase 4 Step 4 — DAFTA: multi-device truth merge (see ufecDafta.js). */
export {
  createDeviceEventSignature,
  DAFTA_AUTHORITY_ORDER,
  DAFTA_CONFLICT_TYPE,
  DAFTA_RESOLUTION_STRATEGY,
  DEVICE_TRUST_WEIGHT,
  mergeDeviceEventStates,
  mergeDeviceSignatureList,
  resolveCanonicalDeviceState,
  suggestDaftaRepairActions,
} from "./ufecDafta.js";
/** Phase 4 Step 6 — Operational health + deterministic recovery. */
export {
  gatherOperationalSignals,
  getLastOperationalSnapshotForObservers,
  getOperationalResilienceSnapshot,
  computeUfecSystemHealthScore,
  mapHealthScoreToOperationalMode,
  UFEC_OPERATIONAL_MODE,
  invalidateOperationalResilienceCache,
} from "./ufecSystemHealth.js";
export {
  RECOVERY_CLASSIFICATION,
  RECOVERY_PRIORITY_ORDER,
  runColdStartResilience,
  runRecoveryLoop,
  runSystemRecovery,
} from "./ufecRecoveryOrchestrator.js";
/** Phase 4 Step 5 — IFETS observability stream (see ufecIfets.js). */
export {
  appendIfetsAnomalyEvent,
  appendIfetsObservation,
  computeStateDiff,
  computeUfecCorrelationId,
  emitDaftaMergeObservationFireAndForget,
  emitExecutionObservationPhase,
  emitSystemHealthObservationFireAndForget,
  emitLedgerFsmObservationFireAndForget,
  emitReconciliationEnqueueObservation,
  emitUfecObservationFireAndForget,
  reconstructFinancialEventTimeline,
  UFEC_ANOMALY_TYPE,
  UFEC_OBSERVATION_PHASE,
  UFEC_OBSERVATION_SUBSYSTEM,
} from "./ufecIfets.js";
