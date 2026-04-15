const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { postChaosRun, getChaosReport, postChaosInject } = require("../controllers/chaosController");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.post("/chaos/run", postChaosRun);
router.get("/chaos/report/:runId", getChaosReport);
router.post("/chaos/inject", postChaosInject);

module.exports = router;
