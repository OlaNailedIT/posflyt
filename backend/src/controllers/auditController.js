const { listAuditLogs } = require("../services/auditService");
const { sendOk } = require("../utils/http");

async function getAuditLogs(req, res, next) {
  try {
    const data = await listAuditLogs(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getAuditLogs };
