const {
  getInvestorMetrics,
  getSalesFeed,
  getBillingOverview,
  listWebhookEventsForBusiness,
  listPaymentsForAdmin,
} = require("../services/adminService");
const { getDailyCloseStatus, confirmDailyClose } = require("../services/dailyCloseService");
const { processDuePaymentRetries } = require("../services/paymentRetryService");
const { reconcilePaymentsForBusiness, applyReconciliationFixes } = require("../services/paymentReconciliationService");
const { sendOk } = require("../utils/http");

async function getAdminSalesFeed(req, res, next) {
  try {
    const data = await getSalesFeed(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminMetrics(_req, res, next) {
  try {
    const data = await getInvestorMetrics();
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminDailyCloseStatus(req, res, next) {
  try {
    const data = await getDailyCloseStatus(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postAdminDailyClose(req, res, next) {
  try {
    const data = await confirmDailyClose(req.auth.businessId, req.auth.userId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminBillingOverview(req, res, next) {
  try {
    const data = await getBillingOverview(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminWebhookEvents(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const data = await listWebhookEventsForBusiness(req.auth.businessId, { limit });
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminPaymentsQuery(req, res, next) {
  try {
    const { q, status, from, to } = req.query;
    const data = await listPaymentsForAdmin(req.auth.businessId, { q, status, from, to });
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postAdminPaymentRetriesRun(req, res, next) {
  try {
    const data = await processDuePaymentRetries();
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getPaymentsReconcile(req, res, next) {
  try {
    const data = await reconcilePaymentsForBusiness(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function postPaymentsReconcileApply(req, res, next) {
  try {
    const data = await applyReconciliationFixes(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAdminSalesFeed,
  getAdminMetrics,
  getAdminDailyCloseStatus,
  postAdminDailyClose,
  getAdminBillingOverview,
  getAdminWebhookEvents,
  getAdminPaymentsQuery,
  postAdminPaymentRetriesRun,
  getPaymentsReconcile,
  postPaymentsReconcileApply,
};
