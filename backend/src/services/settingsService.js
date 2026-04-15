const prisma = require("../config/prisma");
const { logAudit } = require("./auditService");
const { sanitizeDisplayName, normalizeEmail, sanitizePlainText } = require("../utils/sanitize");

const DEFAULT_SETTINGS = {
  currencySymbol: "$",
  taxEnabled: false,
  taxRate: 0,
};

// Future enhancement — not part of MVP:
// countryCode, currencyCode, taxRules, logoUrl, receiptLayout
const ALLOWED_SETTINGS_FIELDS = [
  "currencySymbol",
  "taxEnabled",
  "taxRate",
  "businessName",
  "businessEmail",
  "businessPhone",
  "businessTimeZone",
  "quickSalesProductIds",
];

function sanitizeSettingsPayload(payload = {}) {
  return {
    currencySymbol:
      typeof payload.currencySymbol === "string" && payload.currencySymbol.trim()
        ? sanitizePlainText(payload.currencySymbol.trim(), 8)
        : undefined,
    taxEnabled: typeof payload.taxEnabled === "boolean" ? payload.taxEnabled : undefined,
    taxRate: typeof payload.taxRate === "number" ? payload.taxRate : undefined,
    businessName:
      typeof payload.businessName === "string" && payload.businessName.trim()
        ? sanitizeDisplayName(payload.businessName, 120)
        : undefined,
    businessEmail:
      typeof payload.businessEmail === "string" && payload.businessEmail.trim()
        ? normalizeEmail(payload.businessEmail)
        : undefined,
    businessPhone:
      typeof payload.businessPhone === "string"
        ? sanitizePlainText(payload.businessPhone, 30)
        : undefined,
    businessTimeZone:
      typeof payload.businessTimeZone === "string"
        ? (() => {
            const t = payload.businessTimeZone.trim();
            if (!t) return "UTC";
            return sanitizePlainText(t, 64);
          })()
        : undefined,
    quickSalesProductIds: sanitizeQuickSalesProductIds(payload.quickSalesProductIds),
  };
}

/** @returns {string[] | undefined} up to 48 UUIDs */
function sanitizeQuickSalesProductIds(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const id of raw) {
    if (typeof id !== "string" || !uuidRe.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 48) break;
  }
  return out.length ? out : undefined;
}

function pruneUndefinedFields(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function logStructuredSettingsError({ message, location, error, status = 500 }) {
  // eslint-disable-next-line no-console
  console.error("[POSflyt][settings]", {
    status,
    message,
    location,
    error: error?.message,
  });
}

async function ensureBusinessSettings(businessId) {
  try {
    const existing = await prisma.settings.findUnique({
      where: { businessId },
    });
    if (existing) return existing;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        users: {
          where: { role: "ADMIN" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!business) {
      const error = new Error("Business not found");
      error.statusCode = 404;
      throw error;
    }

    return await prisma.settings.create({
      data: {
        businessId,
        businessName: business.name,
        businessEmail: business.users[0]?.email || "",
        businessPhone: "",
        currencySymbol: DEFAULT_SETTINGS.currencySymbol,
        taxEnabled: DEFAULT_SETTINGS.taxEnabled,
        taxRate: DEFAULT_SETTINGS.taxRate,
      },
    });
  } catch (error) {
    logStructuredSettingsError({
      status: error.statusCode || 500,
      message: "Failed to ensure business settings",
      location: "services/settingsService.ensureBusinessSettings",
      error,
    });
    throw error;
  }
}

async function updateBusinessSettings(businessId, payload, userId) {
  try {
    await ensureBusinessSettings(businessId);

    const sanitized = pruneUndefinedFields(sanitizeSettingsPayload(payload));
    const updated = await prisma.settings.update({
      where: { businessId },
      data: sanitized,
    });

    await logAudit({
      businessId,
      userId,
      action: "SETTINGS_UPDATED",
      metadata: { keys: Object.keys(sanitized) },
    });
    return updated;
  } catch (error) {
    logStructuredSettingsError({
      status: error.statusCode || 500,
      message: "Failed to update business settings",
      location: "services/settingsService.updateBusinessSettings",
      error,
    });
    throw error;
  }
}

module.exports = {
  ensureBusinessSettings,
  updateBusinessSettings,
  sanitizeSettingsPayload,
  ALLOWED_SETTINGS_FIELDS,
};
