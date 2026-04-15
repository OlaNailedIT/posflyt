/**
 * Phase 5 — derived integrity snapshot (events remain source of truth).
 */
const crypto = require("crypto");
const { stableStringify } = require("../utils/stableStringify");
const { logger } = require("../utils/logger");
const { sortIntegrityEvents } = require("../ledger/projection/balanceEngine");
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("../ledger/projection/stateReducer");
const {
  reconstructFromSortedEvents,
  fingerprintState,
  normalizeLinesForFingerprint,
} = require("../reconciliation/reconstructionEngine");
const { amountEq } = require("../reconciliation/comparisonEngine");
const { publishSnapshotBuilt, publishSnapshotReadPath } = require("../streaming/publish");

function computeSnapshotHashes(sortedEvents, expectedLines, terminalState) {
  const stateHash = crypto
    .createHash("sha256")
    .update(stableStringify(fingerprintState(terminalState)), "utf8")
    .digest("hex");
  const ledgerHash = crypto
    .createHash("sha256")
    .update(stableStringify(normalizeLinesForFingerprint(expectedLines)), "utf8")
    .digest("hex");
  return { stateHash, ledgerHash };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function loadSortedEvents(prisma, businessId, clientTransactionId) {
  const events = await prisma.integrityLedgerEvent.findMany({
    where: { businessId, clientTransactionId },
  });
  return sortIntegrityEvents(events);
}

/**
 * Recompute and upsert snapshot from the full event stream (authoritative).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 * @returns {Promise<{ state: object, eventCount: number, stateHash: string, ledgerHash: string, skipped?: boolean }>}
 */
async function buildSnapshot(prisma, businessId, clientTransactionId) {
  const sorted = await loadSortedEvents(prisma, businessId, clientTransactionId);

  if (sorted.length === 0) {
    const state = initialTransactionFinancialState(clientTransactionId);
    const { stateHash, ledgerHash } = computeSnapshotHashes(sorted, [], state);
    await prisma.integritySnapshot.upsert({
      where: {
        businessId_clientTransactionId: { businessId, clientTransactionId },
      },
      create: {
        businessId,
        clientTransactionId,
        lastEventId: null,
        eventCount: 0,
        stateJson: state,
        balance: state.runningNet,
        ledgerHash,
        stateHash,
      },
      update: {
        lastEventId: null,
        eventCount: 0,
        stateJson: state,
        balance: state.runningNet,
        ledgerHash,
        stateHash,
      },
    });
    const out = { state, eventCount: 0, stateHash, ledgerHash };
    try {
      publishSnapshotBuilt({ businessId, clientTransactionId, result: out });
    } catch (_) {}
    return out;
  }

  const { state, expectedLines } = reconstructFromSortedEvents(sorted);
  const { stateHash, ledgerHash } = computeSnapshotHashes(sorted, expectedLines, state);

  const lastEvent = sorted[sorted.length - 1];

  const existing = await prisma.integritySnapshot.findUnique({
    where: {
      businessId_clientTransactionId: { businessId, clientTransactionId },
    },
  });

  if (
    existing &&
    sorted.length === existing.eventCount &&
    lastEvent &&
    existing.lastEventId === lastEvent.eventId
  ) {
    const out = { state, eventCount: sorted.length, stateHash, ledgerHash, skipped: true };
    try {
      publishSnapshotBuilt({ businessId, clientTransactionId, result: out });
    } catch (_) {}
    return out;
  }

  await prisma.integritySnapshot.upsert({
    where: {
      businessId_clientTransactionId: { businessId, clientTransactionId },
    },
    create: {
      businessId,
      clientTransactionId,
      lastEventId: lastEvent?.eventId ?? null,
      eventCount: sorted.length,
      stateJson: state,
      balance: state.runningNet,
      ledgerHash,
      stateHash,
    },
    update: {
      lastEventId: lastEvent?.eventId ?? null,
      eventCount: sorted.length,
      stateJson: state,
      balance: state.runningNet,
      ledgerHash,
      stateHash,
    },
  });

  const out = { state, eventCount: sorted.length, stateHash, ledgerHash };
  try {
    publishSnapshotBuilt({ businessId, clientTransactionId, result: out });
  } catch (_) {}
  return out;
}

/**
 * Fast read: snapshot hit O(count); otherwise replay or snapshot+delta.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function getFinancialStateFast(prisma, businessId, clientTransactionId) {
  const snap = await prisma.integritySnapshot.findUnique({
    where: {
      businessId_clientTransactionId: { businessId, clientTransactionId },
    },
  });

  const count = await prisma.integrityLedgerEvent.count({
    where: { businessId, clientTransactionId },
  });

  if (count === 0) {
    return {
      source: "empty",
      state: initialTransactionFinancialState(clientTransactionId),
      stale: false,
      appliedDelta: 0,
    };
  }

  if (snap && count === snap.eventCount && (count === 0 || snap.lastEventId)) {
    return {
      source: "snapshot",
      state: snap.stateJson,
      stale: false,
      appliedDelta: 0,
      snapshotMeta: {
        stateHash: snap.stateHash,
        ledgerHash: snap.ledgerHash,
        lastEventId: snap.lastEventId,
      },
    };
  }

  const sorted = await loadSortedEvents(prisma, businessId, clientTransactionId);
  const full = reconstructFromSortedEvents(sorted);

  if (snap && count > snap.eventCount && snap.lastEventId) {
    const idx = sorted.findIndex((e) => e.eventId === snap.lastEventId);
    const delta = idx === -1 ? sorted : sorted.slice(idx + 1);
    let s =
      snap.stateJson && typeof snap.stateJson === "object"
        ? { ...snap.stateJson }
        : initialTransactionFinancialState(clientTransactionId);
    for (const e of delta) {
      s = reduceTransactionFinancialState(s, e);
    }
    if (!amountEq(s.runningNet, full.state.runningNet) || s.status !== full.state.status) {
      logger.warn(
        { businessId, clientTransactionId },
        "snapshot+delta drifted from full replay; returning full replay"
      );
      try {
        publishSnapshotReadPath({
          businessId,
          clientTransactionId,
          source: "replay",
          stale: true,
        });
      } catch (_) {}
      return {
        source: "replay",
        state: full.state,
        stale: true,
        appliedDelta: sorted.length,
      };
    }
    return {
      source: "snapshot_delta",
      state: s,
      stale: false,
      appliedDelta: delta.length,
    };
  }

  const stale = !snap;
  if (stale) {
    try {
      publishSnapshotReadPath({
        businessId,
        clientTransactionId,
        source: "replay",
        stale: true,
      });
    } catch (_) {}
  }
  return {
    source: "replay",
    state: full.state,
    stale,
    appliedDelta: sorted.length,
  };
}

module.exports = {
  buildSnapshot,
  getFinancialStateFast,
  computeSnapshotHashes,
  loadSortedEvents,
};
