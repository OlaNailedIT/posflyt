-- ⚠️ UFEC MIGRATION OVERRIDE
-- This migration referenced legacy financial columns that no longer exist:
-- transactionType, amountPaid, balanceDue
-- These constraints are now enforced at the UFEC layer (ledger, FSM, consistency engine)
-- Migration neutralized to preserve migration chain integrity.

-- NO-OP
