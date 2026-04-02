const {
  getProfitAnalytics,
  getStaffPerformance,
  getSmartAlerts,
  getInsights,
  getForecast,
  getSalesOptimization,
  getForecastDataset,
} = require("../services/analyticsService");
const { sendOk } = require("../utils/http");

async function getProfit(req, res, next) {
  try {
    const data = await getProfitAnalytics(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getStaff(req, res, next) {
  try {
    const data = await getStaffPerformance(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAlerts(req, res, next) {
  try {
    const data = await getSmartAlerts(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getInsightsFeed(req, res, next) {
  try {
    const data = await getInsights(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getForecastData(req, res, next) {
  try {
    const data = await getForecast(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getSalesOptimizationData(req, res, next) {
  try {
    const data = await getSalesOptimization(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getForecastDatasetData(req, res, next) {
  try {
    const data = await getForecastDataset(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfit,
  getStaff,
  getAlerts,
  getInsightsFeed,
  getForecastData,
  getSalesOptimizationData,
  getForecastDatasetData,
};
