const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { getProducts, postProduct, putProduct } = require("../controllers/productController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getProducts);
router.post("/", requirePermission("editProducts"), postProduct);
router.put("/:id", requirePermission("editProducts"), putProduct);

module.exports = router;
