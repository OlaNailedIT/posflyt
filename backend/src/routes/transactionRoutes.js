const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { postTransaction, getTransactions } = require("../controllers/transactionController");

const router = express.Router();

router.use(requireAuth);
router.post("/", postTransaction);
router.get("/", getTransactions);

module.exports = router;
