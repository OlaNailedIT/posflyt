const { slackBillingWebhookUrl } = require("../config/env");
const {
  listTransactionsPaginated,
  getTransactionDetail,
  listAuditEventsPaginated,
  getAuditEventDetail,
  listPaymentsPaginated,
  listWebhookEventsPaginated,
  getSyncSummary,
  listOperationalErrors,
  listMonitoringAlerts,
} = require("../services/adminOpsService");
const { sendOk, sendError } = require("../utils/http");
const { ERROR_CODES } = require("../utils/errorCodes");
const {
  transactionsListQuery,
  eventsListQuery,
  paymentsListQuery,
  webhookEventsListQuery,
  errorsListQuery,
  uuidParam,
  transactionIdParam,
  alertTestBody,
} = require("../validation/adminOpsSchemas");

function validateResult(schema, value, res) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    sendError(res, {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Invalid request parameters",
      location: "adminOpsController",
      details: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
}

async function getTransactions(req, res, next) {
  try {
    const q = validateResult(transactionsListQuery, req.query, res);
    if (!q) return;
    const data = await listTransactionsPaginated(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getTransactionById(req, res, next) {
  try {
    const p = validateResult(transactionIdParam, req.params, res);
    if (!p) return;
    const row = await getTransactionDetail(req.auth.businessId, p.id);
    if (!row) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Transaction not found",
        location: "adminOpsController.getTransactionById",
      });
    }
    return sendOk(res, row);
  } catch (e) {
    return next(e);
  }
}

async function getEvents(req, res, next) {
  try {
    const q = validateResult(eventsListQuery, req.query, res);
    if (!q) return;
    const data = await listAuditEventsPaginated(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getEventById(req, res, next) {
  try {
    const p = validateResult(uuidParam, req.params, res);
    if (!p) return;
    const row = await getAuditEventDetail(req.auth.businessId, p.id);
    if (!row) {
      return sendError(res, {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Event not found",
        location: "adminOpsController.getEventById",
      });
    }
    return sendOk(res, row);
  } catch (e) {
    return next(e);
  }
}

async function getPayments(req, res, next) {
  try {
    const q = validateResult(paymentsListQuery, req.query, res);
    if (!q) return;
    const data = await listPaymentsPaginated(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getWebhookEvents(req, res, next) {
  try {
    const q = validateResult(webhookEventsListQuery, req.query, res);
    if (!q) return;
    const data = await listWebhookEventsPaginated(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getSyncSummaryHandler(req, res, next) {
  try {
    const data = await getSyncSummary(req.auth.businessId);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getErrors(req, res, next) {
  try {
    const q = validateResult(errorsListQuery, req.query, res);
    if (!q) return;
    const data = await listOperationalErrors(req.auth.businessId, q);
    return sendOk(res, data);
  } catch (e) {
    return next(e);
  }
}

async function getMonitoringAlerts(req, res, next) {
  try {
    const rows = await listMonitoringAlerts(req.auth.businessId);
    return sendOk(res, { rows });
  } catch (e) {
    return next(e);
  }
}

async function postAlertTest(req, res, next) {
  try {
    const body = validateResult(alertTestBody, req.body || {}, res);
    if (!body) return;
    if (!slackBillingWebhookUrl) {
      return sendError(res, {
        statusCode: 503,
        code: "ALERTS_NOT_CONFIGURED",
        message: "Slack webhook URL is not configured (SLACK_BILLING_WEBHOOK_URL)",
        location: "adminOpsController.postAlertTest",
      });
    }
    const text =
      body.message ||
      `[POSflyt admin test] businessId=${req.auth.businessId} requestId=${res.getHeader("x-request-id") || "n/a"}`;
    const r = await fetch(slackBillingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      return sendError(res, {
        statusCode: 502,
        code: "ALERT_DELIVERY_FAILED",
        message: `Slack returned ${r.status}`,
        location: "adminOpsController.postAlertTest",
      });
    }
    return sendOk(res, { sent: true });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  getTransactions,
  getTransactionById,
  getEvents,
  getEventById,
  getPayments,
  getWebhookEvents,
  getSyncSummaryHandler,
  getErrors,
  getMonitoringAlerts,
  postAlertTest,
};
