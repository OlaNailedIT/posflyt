/**
 * P0.3.6 — Financial consistency checks (read-only).
 * Run from backend/:  npm run audit:integrity
 *
 * Verifies per transaction:
 *   - line items sum ≈ totalAmount
 *   - amountPaid + balanceDue ≈ totalAmount
 *
 * Exit 1 if any check fails.
 */

require("../src/config/env");
const prisma = require("../src/config/prisma");

const EPS = 0.02;

function closeEnough(a, b) {
  return Math.abs(Number(a) - Number(b)) <= EPS;
}

function roundCurrency(value) {
  const f = 100;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}

async function main() {
  const txs = await prisma.transaction.findMany({
    include: {
      items: true,
      customer: { select: { id: true, name: true, totalOutstanding: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let failures = 0;

  for (const tx of txs) {
    const lineSum = tx.items.reduce((s, it) => s + Number(it.quantity) * Number(it.price), 0);
    const sub = tx.subtotalAmount != null ? Number(tx.subtotalAmount) : lineSum;
    if (!closeEnough(lineSum, sub)) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[FAIL] transaction ${tx.id}: line sum ${lineSum} !== subtotalAmount ${tx.subtotalAmount}`
      );
    }

    const tax = Number(tx.taxAmount || 0);
    const subOrLine = tx.subtotalAmount != null ? Number(tx.subtotalAmount) : lineSum;
    const expectedTotal = roundCurrency(subOrLine + tax);
    if (!closeEnough(expectedTotal, Number(tx.totalAmount))) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[FAIL] transaction ${tx.id}: subtotal+tax (${expectedTotal}) !== totalAmount ${tx.totalAmount}`
      );
    }

    const paidPlusDue = Number(tx.amountPaid) + Number(tx.balanceDue);
    if (!closeEnough(paidPlusDue, tx.totalAmount)) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[FAIL] transaction ${tx.id}: amountPaid+balanceDue (${paidPlusDue}) !== totalAmount (${tx.totalAmount})`
      );
    }
  }

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, totalOutstanding: true },
  });

  for (const c of customers) {
    const agg = await prisma.transaction.aggregate({
      where: { customerId: c.id },
      _sum: { balanceDue: true },
    });
    const sumDue = Number(agg._sum.balanceDue || 0);
    if (!closeEnough(sumDue, c.totalOutstanding)) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[FAIL] customer ${c.id} (${c.name}): sum(balanceDue)=${sumDue} !== totalOutstanding=${c.totalOutstanding}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `audit:integrity — transactions=${txs.length}, customers_checked=${customers.length}, failures=${failures}`
  );

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log("OK: basic financial checks passed.");
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
