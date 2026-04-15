const { z } = require("zod");
const {
  listProducts,
  createProduct,
  updateProduct,
  findProductByBarcode,
} = require("../services/productService");
const { sendOk, sendError } = require("../utils/http");
const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { isFeatureEnabled } = require("../services/featureFlagService");

const productBodySchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(2),
    price: z.coerce.number().nonnegative(),
    costPrice: z.coerce.number().nonnegative().optional(),
    sellingPrice: z.coerce.number().nonnegative().optional(),
    unitType: z.enum(["unit", "kg", "litre"]).optional(),
    pricePerUnit: z.coerce.number().nonnegative().optional().nullable(),
    stock: z.coerce.number().nonnegative(),
    lowStockThreshold: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    barcode: z.string().min(3).optional(),
  })
  .strict();

/** Measured-product rules enforced in productService; Zod v4 disallows .partial() on refined objects. */
const createSchema = productBodySchema;

const updateSchema = productBodySchema.partial().extend({
  lastKnownUpdatedAt: z
    .string()
    .min(1, "lastKnownUpdatedAt is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid lastKnownUpdatedAt" }),
  force: z.boolean().optional(),
}).strict();

async function getProducts(req, res, next) {
  try {
    const data = await listProducts(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getProductByBarcode(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const allowed = await isFeatureEnabled(req.auth.businessId, sub.plan, "INVENTORY_COUNT_MODE");
    if (!allowed) {
      return sendError(res, {
        statusCode: 403,
        code: "FEATURE_DISABLED",
        message: "Inventory count mode is not enabled for this workspace",
        location: "controllers/productController.getProductByBarcode",
      });
    }
    let raw = req.params.code;
    try {
      raw = decodeURIComponent(raw);
    } catch {
      raw = req.params.code;
    }
    const data = await findProductByBarcode(req.auth.businessId, raw);
    if (!data) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "No product with this barcode",
        location: "controllers/productController.getProductByBarcode",
      });
    }
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postProduct(req, res, next) {
  try {
    const payload = createSchema.parse(req.body);
    const data = await createProduct(req.auth.businessId, payload, req.auth.userId);
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/productController.postProduct",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function putProduct(req, res, next) {
  try {
    const payload = updateSchema.parse(req.body);
    const data = await updateProduct(req.auth.businessId, req.params.id, payload, req.auth.userId);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/productController.putProduct",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getProducts, getProductByBarcode, postProduct, putProduct };
