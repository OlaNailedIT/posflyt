/**
 * Phase 4D — load integrity event + ledger projection rows for a single sale scope.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} clientTransactionId
 */
async function readLedgerSnapshot(prisma, businessId, clientTransactionId) {
  const [events, lines] = await Promise.all([
    prisma.integrityLedgerEvent.findMany({
      where: { businessId, clientTransactionId },
    }),
    prisma.integrityLedgerLine.findMany({
      where: { businessId, clientTransactionId },
    }),
  ]);
  return { events, lines };
}

module.exports = {
  readLedgerSnapshot,
};
