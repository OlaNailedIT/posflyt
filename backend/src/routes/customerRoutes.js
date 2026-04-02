const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getCustomers, postCustomer, putCustomer } = require("../controllers/customerController");

const router = express.Router();

router.use(requireAuth);
router.get("/customers", getCustomers);
router.post("/customers", postCustomer);
router.put("/customers/:id", putCustomer);

module.exports = router;
