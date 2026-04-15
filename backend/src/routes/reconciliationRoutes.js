const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getTransactionReconciliation } = require("../controllers/reconciliationController");
const { getFinancialStateForTransaction } = require("../controllers/financialStateController");

const router = express.Router();

/** Phase 4D: forensic replay vs stored ledger lines for one client transaction scope. */
router.get("/reconciliation/transaction/:clientTransactionId", requireAuth, getTransactionReconciliation);

/** Phase 5: fast materialized financial state (snapshot + optional delta replay). */
router.get("/financial-state/transaction/:clientTransactionId", requireAuth, getFinancialStateForTransaction);

module.exports = router;
