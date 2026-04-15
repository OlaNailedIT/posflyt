/**
 * Phase 6 — full transaction explainability for a client transaction scope.
 */
const { sortIntegrityEvents } = require("../../ledger/projection/balanceEngine");
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("../../ledger/projection/stateReducer");
const { readLedgerSnapshot } = require("../../reconciliation/ledgerSnapshotReader");
const { runReconciliationScope } = require("../../reconciliation/reconciliationService");
const {
  classifyIntegrityEventStage,
  orderPipelineStages,
  buildTimelineStages,
} = require("../events/eventClassifier");

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function explainTransactionScope(prisma, businessId, clientTransactionId) {
  const { events, lines } = await readLedgerSnapshot(prisma, businessId, clientTransactionId);
  const sorted = sortIntegrityEvents(events);

  const snapshot = await prisma.integritySnapshot.findUnique({
    where: {
      businessId_clientTransactionId: { businessId, clientTransactionId },
    },
  });

  const canonicalTransaction = await prisma.transaction.findFirst({
    where: { businessId, id: clientTransactionId },
    select: {
      id: true,
      transactionType: true,
      paymentStatus: true,
      totalAmount: true,
      createdAt: true,
      syncStatus: true,
    },
  });

  const timeline = sorted.map((e) => ({
    phase: "INTEGRITY_EVENT",
    type: e.type,
    stage: classifyIntegrityEventStage(e.type),
    eventId: e.eventId,
    source: e.source,
    createdAt: e.createdAt,
    clientTimestampMs: e.clientTimestampMs != null ? String(e.clientTimestampMs) : null,
  }));

  const timelineStages = buildTimelineStages(sorted);

  let s = initialTransactionFinancialState(clientTransactionId);
  const stateTransitions = [];
  for (const e of sorted) {
    const prevNet = s.runningNet;
    const prevStatus = s.status;
    s = reduceTransactionFinancialState(s, e);
    stateTransitions.push({
      eventId: e.eventId,
      type: e.type,
      runningNetBefore: prevNet,
      runningNetAfter: s.runningNet,
      statusBefore: prevStatus,
      statusAfter: s.status,
    });
  }

  const reconciliation = await runReconciliationScope({
    businessId,
    clientTransactionId,
    emitStream: false,
  });

  const pipelinePresent = new Set(timelineStages);
  if (lines.length > 0) pipelinePresent.add("LEDGER_PROJECTED");
  if (snapshot) pipelinePresent.add("SNAPSHOT_UPDATED");
  pipelinePresent.add("RECONCILIATION_CHECKED");

  const pipelineFlow = orderPipelineStages([...pipelinePresent]);

  return {
    transactionId: clientTransactionId,
    canonicalTransaction,
    timeline,
    timelineStages,
    /** Ordered stages for UI flow diagram: Event → … → Reconciliation */
    pipelineFlow,
    stateTransitions,
    ledgerLines: lines.map((l) => ({
      ledgerLineId: l.ledgerLineId,
      lineKind: l.lineKind,
      debit: l.debit,
      credit: l.credit,
      balanceAfter: l.balanceAfter,
      sourceEventId: l.sourceEventId,
      createdAt: l.createdAt,
    })),
    snapshot: snapshot
      ? {
          lastEventId: snapshot.lastEventId,
          eventCount: snapshot.eventCount,
          balance: snapshot.balance,
          stateHash: snapshot.stateHash,
          ledgerHash: snapshot.ledgerHash,
          updatedAt: snapshot.updatedAt,
        }
      : null,
    reconciliation: {
      status: reconciliation.status,
      mismatches: reconciliation.mismatches,
      summary: reconciliation.summary,
      fingerprint: reconciliation.fingerprint,
      severityScore: reconciliation.severityScore,
      lastCheckedAt: new Date().toISOString(),
    },
    terminalState: {
      status: s.status,
      runningNet: s.runningNet,
      balance: s.balance,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  explainTransactionScope,
};
