const { sendError } = require("../utils/http");

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "middlewares/validate.validateBody",
        details: {
          requestId: req.requestId,
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }
    req.body = parsed.data;
    return next();
  };
}

module.exports = { validateBody };
