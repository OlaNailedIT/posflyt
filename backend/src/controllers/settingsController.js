const { z } = require("zod");
const {
  ensureBusinessSettings,
  updateBusinessSettings,
  sanitizeSettingsPayload,
  ALLOWED_SETTINGS_FIELDS,
} = require("../services/settingsService");
const { sendOk, sendError } = require("../utils/http");

const updateSettingsSchema = z.object({
  currencySymbol: z.string().trim().min(1).max(5),
  taxEnabled: z.boolean(),
  taxRate: z.coerce.number().min(0).max(100),
  businessName: z.string().trim().min(2).max(120),
  businessEmail: z.string().trim().email().max(160),
  businessPhone: z.string().trim().max(30).optional().or(z.literal("")),
}).strip();

// Future enhancement — not part of MVP:
// countryCode, currencyCode, taxRules, logoUrl, receiptLayout
function logStructuredSettingsControllerError({ status = 500, message, location, error }) {
  // eslint-disable-next-line no-console
  console.error("[POSflyt][settings]", {
    status,
    message,
    location,
    error: error?.message,
  });
}

async function getSettings(req, res, next) {
  try {
    const data = await ensureBusinessSettings(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    logStructuredSettingsControllerError({
      status: error.statusCode || 500,
      message: "Failed to fetch settings",
      location: "controllers/settingsController.getSettings",
      error,
    });
    return next(error);
  }
}

async function putSettings(req, res, next) {
  try {
    const parsed = updateSettingsSchema.parse(req.body);
    const payload = sanitizeSettingsPayload(parsed);
    const data = await updateBusinessSettings(req.auth.businessId, payload, req.auth.userId);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      logStructuredSettingsControllerError({
        status: 400,
        message: "Settings validation failed",
        location: "controllers/settingsController.putSettings",
        error,
      });
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: `Validation failed. Allowed fields: ${ALLOWED_SETTINGS_FIELDS.join(", ")}`,
        location: "controllers/settingsController.putSettings",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    logStructuredSettingsControllerError({
      status: error.statusCode || 500,
      message: "Failed to update settings",
      location: "controllers/settingsController.putSettings",
      error,
    });
    return next(error);
  }
}

module.exports = { getSettings, putSettings };
