const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { postIntegrityEventIngest } = require("../controllers/integrityIngestController");

const router = express.Router();

/** Phase 4B: financial system-of-record event ingest (idempotent, hash-checked). */
router.post("/events/ingest", requireAuth, postIntegrityEventIngest);

module.exports = router;
