-- CreateIndex
-- ADR 003: composite unique for idempotent sync lookup (client_transaction_id == Transaction.id, scoped by business).
CREATE UNIQUE INDEX "Transaction_client_transaction_id_business_id_key" ON "Transaction"("id", "businessId");
