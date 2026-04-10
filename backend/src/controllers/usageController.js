const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { buildUsageSummary } = require("../services/usageQuotaService");
const { getResolvedFeatureMap, isFeatureEnabled } = require("../services/featureFlagService");
const { logger } = require("../utils/logger");

const whatsAppAttemptSchema = z
  .object({
    transactionId: z.string().uuid(),
    receiptUrl: z.string().url(),
    /** direct = wa.me with number; choose_contact = user picks recipient in WhatsApp */
    shareMode: z.enum(["direct", "choose_contact"]).optional().default("direct"),
    /** Required when shareMode is direct (8–15 digits, country code, no +). */
    customerPhoneDigits: z.string().regex(/^\d{8,15}$/).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.shareMode === "choose_contact") return;
    if (!data.customerPhoneDigits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customerPhoneDigits is required for direct share (8–15 digits)",
        path: ["customerPhoneDigits"],
      });
    }
  });

async function getUsageSummary(req, res, next) {
  try {
    const data = await buildUsageSummary(req.auth.businessId);
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getUsageFeatures(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const flags = await getResolvedFeatureMap(req.auth.businessId, sub.plan);
    return sendOk(res, { plan: sub.plan, flags });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /usage/whatsapp-receipt-attempt — observability for Phase 7.12.3 (deep link opened).
 * Phone is logged masked (last 4 digits only) when shareMode is direct.
 */
async function postWhatsAppReceiptAttempt(req, res, next) {
  try {
    const body = whatsAppAttemptSchema.parse(req.body);
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const allowed = await isFeatureEnabled(req.auth.businessId, sub.plan, "WHATSAPP_RECEIPT");
    if (!allowed) {
      return sendError(res, {
        statusCode: 403,
        code: "FEATURE_DISABLED",
        message: "WhatsApp receipt is not enabled for this workspace",
        location: "controllers/usageController.postWhatsAppReceiptAttempt",
      });
    }
    const digits = body.customerPhoneDigits || "";
    const phoneLast4 =
      body.shareMode === "choose_contact" ? null : digits.length >= 4 ? digits.slice(-4) : null;
    logger.info(
      {
        event: "whatsappReceiptSentAttempt",
        businessId: req.auth.businessId,
        transactionId: body.transactionId,
        receiptUrl: body.receiptUrl || null,
        shareMode: body.shareMode,
        customerPhoneLast4: phoneLast4,
      },
      "whatsapp receipt deep link initiated"
    );
    return sendOk(res, { ok: true });
  } catch (err) {
    if (err.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/usageController.postWhatsAppReceiptAttempt",
        details: { errors: err.issues },
      });
    }
    return next(err);
  }
}

module.exports = { getUsageSummary, getUsageFeatures, postWhatsAppReceiptAttempt };
