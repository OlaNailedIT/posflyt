const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { getExport } = require("../controllers/exportController");

const router = express.Router();

router.use(requireAuth);
router.get("/exports/:type", getExport);

module.exports = router;
