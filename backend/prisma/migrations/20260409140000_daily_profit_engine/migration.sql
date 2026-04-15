-- Daily Profit Engine (DPE): snapshot cost per line, transaction COGS rollups, expense calendar date.

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "totalCogs" DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "grossLineProfit" DOUBLE PRECISION;

ALTER TABLE "TransactionItem" ADD COLUMN IF NOT EXISTS "unitCostAtSale" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TransactionItem" ADD COLUMN IF NOT EXISTS "lineSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TransactionItem" ADD COLUMN IF NOT EXISTS "lineCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TransactionItem" ADD COLUMN IF NOT EXISTS "lineProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expenseDate" TIMESTAMP(3);

-- Backfill line economics from product cost at read time (historical best-effort).
UPDATE "TransactionItem" AS ti
SET
  "unitCostAtSale" = ROUND(CAST(COALESCE(p."costPrice", 0) AS NUMERIC), 4),
  "lineSubtotal" = ROUND(CAST((ABS(ti.quantity) * ti.price) AS NUMERIC), 4),
  "lineCost" = ROUND(CAST((ABS(ti.quantity) * COALESCE(p."costPrice", 0)) AS NUMERIC), 4),
  "lineProfit" = ROUND(CAST((ABS(ti.quantity) * (ti.price - COALESCE(p."costPrice", 0))) AS NUMERIC), 4)
FROM "Product" AS p
WHERE ti."productId" = p.id;

UPDATE "Transaction" AS t
SET
  "totalCogs" = s.sc,
  "grossLineProfit" = s.gp
FROM (
  SELECT "transactionId",
    SUM("lineCost") AS sc,
    SUM("lineProfit") AS gp
  FROM "TransactionItem"
  GROUP BY "transactionId"
) AS s
WHERE t.id = s."transactionId";

UPDATE "Expense" SET "expenseDate" = date_trunc('day', "createdAt") WHERE "expenseDate" IS NULL;
