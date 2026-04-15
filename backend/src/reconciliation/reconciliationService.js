/**
 * Phase 4D — orchestrates snapshot → replay → compare → report.
 */
const prisma = require("../config/prisma");
const { rebuildFinancialState } = require("../ledger/projection/balanceEngine");
const { rebuildFromDatabase } = require("./reconstructionEngine");
const { compareLedgerProjection, amountEq } = require("./comparisonEngine");
const { buildReconciliationReport } = require("./reconciliationReport");
const { publishReconciliationReport } = require("../streaming/publish");

/**
 * @param {{ businessId: string, clientTransactionId: string, emitStream?: boolean }} args
 */
async function runReconciliationScope(args) {
  const { businessId, clientTransactionId, emitStream = true } = args;
  const rebuilt = await rebuildFromDatabase(prisma, businessId, clientTransactionId);

  const comparison = compareLedgerProjection(rebuilt.expectedLines, rebuilt.storedLines, rebuilt.state);

  const reducerOnly = rebuildFinancialState(rebuilt.sortedEvents);
  if (!amountEq(reducerOnly.runningNet, rebuilt.state.runningNet)) {
    comparison.mismatches.push({
      code: "REDUCER_REPLAY_INVARIANT",
      reducerRunningNet: reducerOnly.runningNet,
      replayRunningNet: rebuilt.state.runningNet,
    });
    comparison.match = false;
  }

  const report = buildReconciliationReport({
    businessId,
    clientTransactionId,
    comparison,
    terminalState: rebuilt.state,
    eventCount: rebuilt.eventCount,
    ledgerLineCountExpected: rebuilt.expectedLines.length,
    ledgerLineCountStored: rebuilt.storedLineCount,
    fingerprints: rebuilt.fingerprints,
    ledgerNetFromStored: rebuilt.ledgerNetFromStored,
  });

  if (emitStream) {
    try {
      publishReconciliationReport({ businessId, clientTransactionId, report });
    } catch {
      /* streaming must never break reconciliation */
    }
  }

  return report;
}

module.exports = {
  runReconciliationScope,
};
