/**
 * Phase 6.5 — narrow publish API so domain code does not construct envelopes by hand.
 */
const { getEventBus } = require("./eventBus/eventBus");
const { buildStreamEvent } = require("./eventEnvelope");
const T = require("./streamEventTypes");

function publish(ev) {
  getEventBus().publish(ev);
}

/**
 * @param {object} args
 * @param {boolean} [args.duplicate]
 * @param {string} args.businessId
 * @param {string} args.clientTransactionId
 * @param {string} args.eventId
 * @param {string} args.integrityType
 */
function publishIngestOutcome(args) {
  const { duplicate, businessId, clientTransactionId, eventId, integrityType } = args;
  if (duplicate) {
    publish(
      buildStreamEvent({
        type: T.IDEMPOTENCY_HIT,
        businessId,
        clientTransactionId,
        source: "ingest",
        payload: { eventId, integrityType },
      })
    );
    return;
  }
  publish(
    buildStreamEvent({
      type: T.TRANSACTION_ACCEPTED,
      businessId,
      clientTransactionId,
      source: "ingest",
      payload: { eventId, integrityType },
    })
  );
}

/**
 * @param {object} args
 * @param {string} args.businessId
 * @param {string} args.clientTransactionId
 * @param {string} args.eventId
 * @param {boolean} args.projectedOk
 */
function publishLedgerProjection(args) {
  const { businessId, clientTransactionId, eventId, projectedOk } = args;
  publish(
    buildStreamEvent({
      type: T.LEDGER_LINE_CREATED,
      businessId,
      clientTransactionId,
      source: "projection",
      payload: { sourceEventId: eventId, projectedOk },
    })
  );
}

/**
 * @param {object} args
 * @param {string} args.businessId
 * @param {string} args.clientTransactionId
 * @param {object} args.result — buildSnapshot return
 */
function publishSnapshotBuilt(args) {
  const { businessId, clientTransactionId, result } = args;
  const type = result.skipped ? T.SNAPSHOT_REFRESHED : T.SNAPSHOT_CREATED;
  publish(
    buildStreamEvent({
      type,
      businessId,
      clientTransactionId,
      source: "snapshot",
      payload: {
        eventCount: result.eventCount,
        skipped: Boolean(result.skipped),
        stateHash: result.stateHash,
        ledgerHash: result.ledgerHash,
      },
    })
  );
}

/**
 * @param {object} args
 * @param {string} args.businessId
 * @param {string} args.clientTransactionId
 * @param {object} report — reconciliation report
 */
function publishReconciliationReport(args) {
  const { businessId, clientTransactionId, report } = args;
  const status = String(report.status || "").toUpperCase();
  let type = T.RECONCILIATION_PASS;
  if (status === "FAIL") type = T.RECONCILIATION_FAIL;
  else if (status === "DEGRADED") type = T.RECONCILIATION_DEGRADED;

  const ev = buildStreamEvent({
    type,
    businessId,
    clientTransactionId,
    source: "reconciliation",
    payload: {
      status: report.status,
      severityScore: report.severityScore,
      mismatchCount: Array.isArray(report.mismatches) ? report.mismatches.length : 0,
    },
  });
  publish(ev);

  if (status === "FAIL" || status === "DEGRADED") {
    publish(
      buildStreamEvent({
        type: T.STATE_DRIFT_DETECTED,
        businessId,
        clientTransactionId,
        source: "reconciliation",
        payload: { status: report.status, severityScore: report.severityScore },
      })
    );
  }
}

/**
 * Fast-read path telemetry (snapshot vs delta vs replay).
 * @param {object} args
 */
function publishSnapshotReadPath(args) {
  const { businessId, clientTransactionId, source, stale } = args;
  if (source === "replay" && stale) {
    publish(
      buildStreamEvent({
        type: T.SNAPSHOT_FALLBACK_USED,
        businessId,
        clientTransactionId,
        source: "snapshot",
        payload: { readPath: source, stale: true },
      })
    );
  }
}

module.exports = {
  publish,
  buildStreamEvent,
  publishIngestOutcome,
  publishLedgerProjection,
  publishSnapshotBuilt,
  publishReconciliationReport,
  publishSnapshotReadPath,
  streamTypes: T,
};
