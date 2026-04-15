/**
 * Phase 4D — deterministic replay from stored events (reuses Phase 4C engine).
 */
const crypto = require("crypto");
const { stableStringify } = require("../utils/stableStringify");
const { sortIntegrityEvents } = require("../ledger/projection/balanceEngine");
const { initialTransactionFinancialState } = require("../ledger/projection/stateReducer");
const { projectEvent } = require("../ledger/projection/projectionEngine");
const { readLedgerSnapshot } = require("./ledgerSnapshotReader");

/**
 * Fold the full sorted stream and collect every ledger line intent the engine would emit.
 * @param {object[]} sortedEvents
 * @returns {{ state: object, expectedLines: object[] }}
 */
function reconstructFromSortedEvents(sortedEvents) {
  if (!sortedEvents.length) {
    return {
      state: initialTransactionFinancialState(""),
      expectedLines: [],
    };
  }
  const id = sortedEvents[0].clientTransactionId;
  let s = initialTransactionFinancialState(id);
  const expectedLines = [];
  for (const ev of sortedEvents) {
    const { nextState, lineIntents } = projectEvent(ev, s);
    s = nextState;
    for (const line of lineIntents) {
      expectedLines.push({
        ledgerLineId: line.ledgerLineId,
        lineKind: line.lineKind,
        debit: line.debit,
        credit: line.credit,
        balanceAfter: line.balanceAfter,
        sourceEventId: line.sourceEventId,
      });
    }
  }
  return { state: s, expectedLines };
}

function normalizeEventsForFingerprint(sortedEvents) {
  return sortedEvents.map((e) => ({
    eventId: e.eventId,
    type: e.type,
    clientTransactionId: e.clientTransactionId,
    payloadHash: e.payloadHash,
    clientTimestampMs: e.clientTimestampMs != null ? String(e.clientTimestampMs) : null,
    payload: e.payload,
  }));
}

function normalizeLinesForFingerprint(lines) {
  const sorted = [...lines].sort((a, b) => (a.ledgerLineId < b.ledgerLineId ? -1 : a.ledgerLineId > b.ledgerLineId ? 1 : 0));
  return sorted.map((l) => ({
    ledgerLineId: l.ledgerLineId,
    lineKind: l.lineKind,
    debit: l.debit,
    credit: l.credit,
    balanceAfter: l.balanceAfter,
    sourceEventId: l.sourceEventId,
  }));
}

function fingerprintState(state) {
  return {
    transactionId: state.transactionId,
    status: state.status,
    runningNet: state.runningNet,
    balance: state.balance,
    totals: state.totals,
  };
}

/**
 * @param {object[]} sortedEvents
 * @param {object[]} canonicalExpectedLines — replay output
 * @param {object} terminalState
 * @param {object[]} storedLines
 */
function computeFingerprints(sortedEvents, canonicalExpectedLines, terminalState, storedLines) {
  const eventsHash = crypto
    .createHash("sha256")
    .update(stableStringify(normalizeEventsForFingerprint(sortedEvents)), "utf8")
    .digest("hex");
  const ledgerExpectedHash = crypto
    .createHash("sha256")
    .update(stableStringify(normalizeLinesForFingerprint(canonicalExpectedLines)), "utf8")
    .digest("hex");
  const ledgerStoredHash = crypto
    .createHash("sha256")
    .update(stableStringify(normalizeLinesForFingerprint(storedLines)), "utf8")
    .digest("hex");
  const stateHash = crypto
    .createHash("sha256")
    .update(stableStringify(fingerprintState(terminalState)), "utf8")
    .digest("hex");

  return {
    eventsHash,
    ledgerExpectedHash,
    ledgerStoredHash,
    stateHash,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function rebuildFromDatabase(prisma, businessId, clientTransactionId) {
  const { events, lines: storedLines } = await readLedgerSnapshot(prisma, businessId, clientTransactionId);
  const sorted = sortIntegrityEvents(events);
  const { state, expectedLines } = reconstructFromSortedEvents(sorted);
  const fp = computeFingerprints(sorted, expectedLines, state, storedLines);

  const ledgerNetFromStored = storedLines.reduce((acc, l) => acc + (Number(l.credit) - Number(l.debit)), 0);

  return {
    state,
    expectedLines,
    sortedEvents: sorted,
    storedLines,
    eventCount: sorted.length,
    storedLineCount: storedLines.length,
    ledgerNetFromStored,
    fingerprints: fp,
  };
}

module.exports = {
  reconstructFromSortedEvents,
  rebuildFromDatabase,
  computeFingerprints,
  normalizeEventsForFingerprint,
  normalizeLinesForFingerprint,
  fingerprintState,
};
