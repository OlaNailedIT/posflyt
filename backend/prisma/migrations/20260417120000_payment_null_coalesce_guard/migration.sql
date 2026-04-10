-- Final seal: legacy null safety on payment columns.
UPDATE "Transaction"
SET
  "amountPaid" = COALESCE("amountPaid", "totalAmount"),
  "balanceDue" = COALESCE("balanceDue", 0);
