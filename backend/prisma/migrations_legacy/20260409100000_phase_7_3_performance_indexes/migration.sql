-- Phase 7.3: hot-path query acceleration (tenant + time-ordered lists, joins)

CREATE INDEX "User_businessId_idx" ON "User"("businessId");
CREATE INDEX "Store_businessId_idx" ON "Store"("businessId");
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");
CREATE INDEX "Transaction_businessId_createdAt_idx" ON "Transaction"("businessId", "createdAt" DESC);
CREATE INDEX "TransactionItem_transactionId_idx" ON "TransactionItem"("transactionId");
CREATE INDEX "TransactionItem_productId_idx" ON "TransactionItem"("productId");
CREATE INDEX "SmartAlert_businessId_idx" ON "SmartAlert"("businessId");
CREATE INDEX "PaymentHistory_businessId_idx" ON "PaymentHistory"("businessId");
CREATE INDEX "ActiveSession_userId_idx" ON "ActiveSession"("userId");
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt" DESC);
CREATE INDEX "BackupRecord_businessId_idx" ON "BackupRecord"("businessId");
CREATE INDEX "IssueReport_businessId_idx" ON "IssueReport"("businessId");
