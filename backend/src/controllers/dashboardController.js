const { getDashboardStats } = require("../services/dashboardService");
const { sendOk } = require("../utils/http");

async function getStats(req, res, next) {
  try {
    const data = await getDashboardStats(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getStats };
