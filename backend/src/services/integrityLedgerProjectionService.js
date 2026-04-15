const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("../ledger/projection/stateReducer");
const { projectEvent } = require("../ledger/projection/projectionEngine");
const { sortIntegrityEvents, compareIntegrityEvents } = require("../ledger/projection/balanceEngine");

/**
 * Recompute reducer state from all strictly-earlier events in this (business, clientTransactionId) scope.
 * @param {object[]} sortedAll
 * @param {object} currentEvent
 */
function foldPriorState(sortedAll, currentEvent) {
  const prior = sortedAll.filter((e) => compareIntegrityEvents(e, currentEvent) < 0);
  let state = initialTransactionFinancialState(currentEvent.clientTransactionId);
  for (const e of prior) {
    state = reduceTransactionFinancialState(state, e);
  }
  return state;
}

/**
 * Deterministic projection after ingest: append-only lines derived from rules + prior stream.
 * @param {object} event — persisted IntegrityLedgerEvent row
 * @returns {Promise<boolean>}
 */
async function projectIntegrityLedgerLines(event) {
  const rows = await prisma.integrityLedgerEvent.findMany({
    where: {
      businessId: event.businessId,
      clientTransactionId: event.clientTransactionId,
    },
  });
  const sorted = sortIntegrityEvents(rows);
  const priorState = foldPriorState(sorted, event);
  const { lineIntents } = projectEvent(event, priorState);

  for (const line of lineIntents) {
    try {
      await prisma.integrityLedgerLine.create({
        data: {
          ledgerLineId: line.ledgerLineId,
          businessId: event.businessId,
          clientTransactionId: event.clientTransactionId,
          transactionId: event.transactionId ?? null,
          debit: line.debit,
          credit: line.credit,
          lineKind: line.lineKind,
          sourceEventId: line.sourceEventId,
          balanceAfter: line.balanceAfter,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }
  return true;
}

/**
 * Never throws: ingestion must not fail if projection breaks (event row already committed).
 * @param {object} event
 * @returns {Promise<boolean>}
 */
async function projectIntegrityLedgerLinesSafe(event) {
  try {
    return await projectIntegrityLedgerLines(event);
  } catch (err) {
    logger.error(
      { err, eventId: event.eventId, businessId: event.businessId },
      "integrity ledger projection failed (event stored; retry projection separately)"
    );
    return false;
  }
}

module.exports = {
  projectIntegrityLedgerLines,
  projectIntegrityLedgerLinesSafe,
};
