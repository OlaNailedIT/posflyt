const { z } = require("zod");
const { listProducts, createProduct, updateProduct } = require("../services/productService");
const { sendOk, sendError } = require("../utils/http");

const createSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  price: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative().optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
  stock: z.coerce.number().int().nonnegative(),
  lowStockThreshold: z.coerce.number().int().nonnegative().optional(),
  barcode: z.string().min(3).optional(),
});

const updateSchema = createSchema.partial();

async function getProducts(req, res, next) {
  try {
    const data = await listProducts(req.auth.businessId);
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

module.exports = { getProducts, postProduct, putProduct };
