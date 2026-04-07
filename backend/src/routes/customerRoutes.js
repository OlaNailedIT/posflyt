const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getCustomers, postCustomer, putCustomer } = require("../controllers/customerController");

const router = express.Router();

router.get("/customers", requireAuth, getCustomers);
router.post("/customers", requireAuth, postCustomer);
router.put("/customers/:id", requireAuth, putCustomer);

module.exports = router;
