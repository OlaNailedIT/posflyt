const {
  getInvestorMetrics,
  getSalesFeed,
  getDailyCloseStatus,
  confirmDailyClose,
} = require("../services/adminService");
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

module.exports = { getAdminSalesFeed, getAdminMetrics, getAdminDailyCloseStatus, postAdminDailyClose };
