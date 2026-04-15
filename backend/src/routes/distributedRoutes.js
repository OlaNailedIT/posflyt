const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getShardMetadata,
  getRegionalPipeline,
  getTenantDerivedGlobal,
  getRegionalAggregate,
  getLocalRegionHealthEndpoint,
} = require("../controllers/distributedController");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/distributed/shard", getShardMetadata);
router.get("/distributed/pipeline", getRegionalPipeline);
router.get("/distributed/tenant-global", getTenantDerivedGlobal);
router.get("/distributed/regional-aggregate", getRegionalAggregate);
router.get("/distributed/local-region-health", getLocalRegionHealthEndpoint);

module.exports = router;
