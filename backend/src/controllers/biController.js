const { nowISOString } = require("../utils/date.js");
const { slackBillingWebhookUrl } = require("../config/env");
const { getSnapshot, listTransactionsDrilldown, buildSlackSummaryText } = require("../services/biService");
const { getTransactionDetail } = require("../services/adminOpsService");
const { sendOk, sendError } = require("../utils/http");
const { ERROR_CODES } = require("../utils/errorCodes");
const { snapshotQuery, drilldownQuery, slackSummaryBody, transactionIdParam } = require("../validation/biSchemas");

function parse(schema, value, res) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    sendError(res, {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Invalid request parameters",
      location: "biController",
      details: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
}

async function getBiSnapshot(req, res, next) {
  try {
    const q = parse(snapshotQuery, req.query, res);
    if (!q) return;
    const data = await getSnapshot(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    if (e.statusCode) {
      return sendError(res, {
        statusCode: e.statusCode,
        code: "INVALID_RANGE",
        message: e.message,
        location: "biController.getBiSnapshot",
      });
    }
    return next(e);
  }
}

async function getBiTransactions(req, res, next) {
  try {
    const q = parse(drilldownQuery, req.query, res);
    if (!q) return;
    const data = await listTransactionsDrilldown(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    if (e.statusCode) {
      return sendError(res, {
        statusCode: e.statusCode,
        code: "INVALID_RANGE",
        message: e.message,
        location: "biController.getBiTransactions",
      });
    }
    return next(e);
  }
}

async function getBiTransactionById(req, res, next) {
  try {
    const p = parse(transactionIdParam, req.params, res);
    if (!p) return;
    const row = await getTransactionDetail(req.auth.businessId, p.id);
    if (!row) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Transaction not found",
        location: "biController.getBiTransactionById",
      });
    }
    return sendOk(res, row);
  } catch (e) {
    return next(e);
  }
}

async function postSlackSummary(req, res, next) {
  try {
    const body = parse(slackSummaryBody, req.body || {}, res);
    if (!body) return;
    if (!slackBillingWebhookUrl) {
      return sendError(res, {
        statusCode: 503,
        code: "SLACK_NOT_CONFIGURED",
        message: "SLACK_BILLING_WEBHOOK_URL is not set",
        location: "biController.postSlackSummary",
      });
    }
    const from = body.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = body.to || nowISOString();
    const text = await buildSlackSummaryText(req.auth.businessId, { from, to, granularity: "day" });
    const r = await fetch(slackBillingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      return sendError(res, {
        statusCode: 502,
        code: "SLACK_DELIVERY_FAILED",
        message: `Slack returned ${r.status}`,
        location: "biController.postSlackSummary",
      });
    }
    return sendOk(res, { sent: true });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  getBiSnapshot,
  getBiTransactions,
  getBiTransactionById,
  postSlackSummary,
};
