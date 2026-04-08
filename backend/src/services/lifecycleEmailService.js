const { logger } = require("../utils/logger");

/**
 * Phase 7.5: placeholder for SendGrid/SES lifecycle & upsell emails.
 * Wire a provider here without changing call sites.
 */
async function notifyQuotaApproaching({ businessId, resource, used, limit }) {
  logger.info(
    { event: "LIFECYCLE_EMAIL_STUB", template: "quota_soft", businessId, resource, used, limit },
    "would send quota warning email"
  );
}

async function notifyQuotaExceeded({ businessId, resource }) {
  logger.info(
    { event: "LIFECYCLE_EMAIL_STUB", template: "quota_hard", businessId, resource },
    "would send quota exceeded / upsell email"
  );
}

async function notifyLoyaltyOffer({ businessId, reason }) {
  logger.info(
    { event: "LIFECYCLE_EMAIL_STUB", template: "loyalty_offer", businessId, reason },
    "would send loyalty / retention offer email"
  );
}

module.exports = {
  notifyQuotaApproaching,
  notifyQuotaExceeded,
  notifyLoyaltyOffer,
};
