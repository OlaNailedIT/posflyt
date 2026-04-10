const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { requireFeature } = require("../middlewares/requireFeature");
const {
  getCustomers,
  postCustomer,
  putCustomer,
  postSettleCredit,
} = require("../controllers/customerController");

const router = express.Router();

router.get("/customers", requireAuth, getCustomers);
router.post("/customers", requireAuth, postCustomer);
router.put("/customers/:id", requireAuth, putCustomer);
router.post(
  "/customers/:id/settle-credit",
  requireAuth,
  requireAdmin,
  requireFeature("CREDIT_SALES"),
  postSettleCredit
);

module.exports = router;
