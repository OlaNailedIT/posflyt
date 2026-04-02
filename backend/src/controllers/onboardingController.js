const { getOnboardingStatus, markBusinessActive } = require("../services/onboardingService");
const { sendOk } = require("../utils/http");

async function getStatus(req, res, next) {
  try {
    const data = await getOnboardingStatus(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function markActive(req, res, next) {
  try {
    await markBusinessActive(req.auth.businessId);
    return sendOk(res, { ok: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getStatus, markActive };
