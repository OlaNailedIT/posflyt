/**
 * Phase 4D — compare replayed ledger intents vs persisted projection rows.
 */
const { roundCurrency } = require("../utils/paymentState");

const EPS = 0.005;

/**
 * @param {number} a
 * @param {number} b
 */
function amountEq(a, b) {
  return Math.abs(roundCurrency(Number(a)) - roundCurrency(Number(b))) < EPS;
}

/**
 * @param {object[]} expectedLines — from reconstruction engine
 * @param {object[]} storedLines — Prisma IntegrityLedgerLine rows
 * @param {object} terminalState — after full replay
 */
function compareLedgerProjection(expectedLines, storedLines, terminalState) {
  const mismatches = [];
  const expectedById = new Map(expectedLines.map((l) => [l.ledgerLineId, l]));
  const storedById = new Map(storedLines.map((l) => [l.ledgerLineId, l]));

  for (const [id, exp] of expectedById) {
    const st = storedById.get(id);
    if (!st) {
      mismatches.push({
        code: "MISSING_LEDGER_LINE",
        ledgerLineId: id,
        expected: exp,
      });
      continue;
    }
    if (String(st.lineKind) !== String(exp.lineKind)) {
      mismatches.push({
        code: "LINE_KIND_MISMATCH",
        ledgerLineId: id,
        expected: exp.lineKind,
        actual: st.lineKind,
      });
    }
    if (!amountEq(st.debit, exp.debit)) {
      mismatches.push({
        code: "DEBIT_DRIFT",
        ledgerLineId: id,
        expected: exp.debit,
        actual: st.debit,
      });
    }
    if (!amountEq(st.credit, exp.credit)) {
      mismatches.push({
        code: "CREDIT_DRIFT",
        ledgerLineId: id,
        expected: exp.credit,
        actual: st.credit,
      });
    }
    if (!amountEq(st.balanceAfter, exp.balanceAfter)) {
      mismatches.push({
        code: "BALANCE_AFTER_DRIFT",
        ledgerLineId: id,
        expected: exp.balanceAfter,
        actual: st.balanceAfter,
      });
    }
    if (st.sourceEventId !== exp.sourceEventId) {
      mismatches.push({
        code: "SOURCE_EVENT_MISMATCH",
        ledgerLineId: id,
        expected: exp.sourceEventId,
        actual: st.sourceEventId,
      });
    }
  }

  for (const st of storedLines) {
    if (!expectedById.has(st.ledgerLineId)) {
      mismatches.push({
        code: "EXTRA_LEDGER_LINE",
        ledgerLineId: st.ledgerLineId,
        actual: {
          lineKind: st.lineKind,
          debit: st.debit,
          credit: st.credit,
          balanceAfter: st.balanceAfter,
          sourceEventId: st.sourceEventId,
        },
      });
    }
  }

  const netFromLines = storedLines.reduce((acc, l) => acc + (Number(l.credit) - Number(l.debit)), 0);
  if (!amountEq(netFromLines, terminalState.runningNet)) {
    mismatches.push({
      code: "STATE_NET_DRIFT",
      expectedRunningNet: terminalState.runningNet,
      netImpliedByStoredLines: roundCurrency(netFromLines),
    });
  }

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}

module.exports = {
  compareLedgerProjection,
  amountEq,
};
