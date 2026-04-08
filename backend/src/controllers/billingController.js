const { z } = require("zod");
const {
  createCheckoutSession,
  finalizePaidCheckout,
  markPaymentFailedFromWebhook,
  isWebhookEventProcessed,
  verifyWebhookSignature,
  verifyPaystackSignature,
  getPaymentHistory,
  confirmPaymentForBusiness,
  persistStripeCredentialsFromCheckoutSession,
  persistPaystackAuthorizationFromCharge,
} = require("../services/paymentService");
const { ensureBusinessSubscription, getSubscriptionAccessSummary } = require("../services/subscriptionService");
const prisma = require("../config/prisma");
const { processTrialNotifications, recordLifecycleEvent } = require("../services/subscriptionLifecycleService");
const { logAudit } = require("../services/auditService");
const { sendOk, sendError } = require("../utils/http");
const Stripe = require("stripe");
const { stripeSecretKey, stripeWebhookSecret, billingMode } = require("../config/env");
const { incrementBillingWebhookFailures } = require("../services/runtimeMetricsService");

function billingWebhookVerificationFailed(res, opts) {
  incrementBillingWebhookFailures(1);
  return sendError(res, opts);
}

const checkoutSchema = z
  .object({
    plan: z.enum(["FREE", "BASIC", "PREMIUM"]),
    provider: z.enum(["STRIPE", "PAYSTACK"]),
  })
  .strict();
const confirmSchema = z
  .object({
    providerRef: z.string().min(5),
    provider: z.enum(["STRIPE", "PAYSTACK"]),
    plan: z.enum(["FREE", "BASIC", "PREMIUM"]),
  })
  .strict();

async function getCurrentSubscription(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const access = getSubscriptionAccessSummary(sub);
    const { warnings } = await processTrialNotifications(sub);
    return sendOk(res, {
      ...sub,
      ...access,
      lifecycleWarnings: warnings,
    });
  } catch (error) {
    return next(error);
  }
}

async function postCheckoutSession(req, res, next) {
  try {
    const payload = checkoutSchema.parse(req.body);
    const data = await createCheckoutSession({
      businessId: req.auth.businessId,
      plan: payload.plan,
      provider: payload.provider,
      clientRequestId: req.requestId,
    });
    return sendOk(res, { ...data, requestId: req.requestId }, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/billingController.postCheckoutSession",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function stripeWebhook(req, res, next) {
  try {
    req.log?.info({ route: "stripeWebhook", billingMode, event: "webhook_received" }, "billing webhook (legacy path)");
    const signature = req.headers["x-posflyt-signature"] || "";
    const bodyString = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    let parsedBody;
    try {
      parsedBody = Buffer.isBuffer(req.body) ? JSON.parse(bodyString) : req.body || {};
    } catch {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_JSON",
        message: "Invalid webhook body",
        location: "controllers/billingController.stripeWebhook",
        details: { requestId: req.requestId },
      });
    }
    if (!verifyWebhookSignature("STRIPE", bodyString, signature)) {
      return billingWebhookVerificationFailed(res, {
        statusCode: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: "Invalid webhook signature",
        location: "controllers/billingController.stripeWebhook",
        details: { requestId: req.requestId },
      });
    }

    const { providerRef, status, eventId } = parsedBody;
    const st = String(status || "").toUpperCase();
    req.log?.info({ providerRef, eventId, status }, "stripe webhook payload");
    if ((st !== "PAID" && status !== "paid") || !providerRef) {
      return sendOk(res, { received: true });
    }
    const dk = eventId || providerRef;
    if (await isWebhookEventProcessed("STRIPE", dk)) {
      return sendOk(res, { received: true, duplicate: true });
    }
    const result = await finalizePaidCheckout({
      provider: "STRIPE",
      providerRef,
      dedupeKey: dk,
    });
    return sendOk(res, { received: true, duplicate: Boolean(result?.skipped) });
  } catch (error) {
    if (error.statusCode === 404) {
      return sendOk(res, { received: true, ignored: true });
    }
    return next(error);
  }
}

async function paystackWebhook(req, res, next) {
  try {
    req.log?.info({ route: "paystackWebhook", billingMode, event: "webhook_received" }, "billing webhook (legacy path)");
    const signature = (req.headers["x-paystack-signature"] || req.headers["x-posflyt-signature"] || "").toString();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (req.headers["x-paystack-signature"] && !verifyPaystackSignature(raw, signature)) {
      return billingWebhookVerificationFailed(res, {
        statusCode: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: "Invalid webhook signature",
        location: "controllers/billingController.paystackWebhook",
        details: { requestId: req.requestId },
      });
    }
    if (!req.headers["x-paystack-signature"]) {
      const bodyString = raw.toString("utf8");
      if (!verifyWebhookSignature("PAYSTACK", bodyString, signature)) {
        return billingWebhookVerificationFailed(res, {
          statusCode: 401,
          code: "INVALID_WEBHOOK_SIGNATURE",
          message: "Invalid webhook signature",
          location: "controllers/billingController.paystackWebhook",
          details: { requestId: req.requestId },
        });
      }
    }

    const parsed = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString("utf8")) : req.body || {};
    const { providerRef, status, eventId } = parsed;
    const st = String(status || "").toUpperCase();
    req.log?.info({ providerRef, eventId, status }, "paystack webhook payload");
    if ((st !== "PAID" && status !== "paid") || !providerRef) {
      return sendOk(res, { received: true });
    }
    const dk = eventId || providerRef;
    if (await isWebhookEventProcessed("PAYSTACK", dk)) {
      return sendOk(res, { received: true, duplicate: true });
    }
    const result = await finalizePaidCheckout({
      provider: "PAYSTACK",
      providerRef,
      dedupeKey: dk,
    });
    return sendOk(res, { received: true, duplicate: Boolean(result?.skipped) });
  } catch (error) {
    if (error.statusCode === 404) {
      return sendOk(res, { received: true, ignored: true });
    }
    return next(error);
  }
}

async function listPayments(req, res, next) {
  try {
    const data = await getPaymentHistory(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

async function confirmPayment(req, res, next) {
  try {
    const payload = confirmSchema.parse(req.body);
    const data = await confirmPaymentForBusiness({
      businessId: req.auth.businessId,
      providerRef: payload.providerRef,
      provider: payload.provider,
      plan: payload.plan,
    });
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/billingController.confirmPayment",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

/**
 * POST /api/payments/webhook/stripe — raw body for Stripe-Signature verification.
 * Falls back to JSON + x-posflyt-signature (custom) when not a Stripe-signed payload.
 */
async function stripeApiWebhook(req, res, next) {
  try {
    const buf = req.body;
    const sig = req.headers["stripe-signature"];
    if (Buffer.isBuffer(buf) && sig && stripeWebhookSecret) {
      const stripe = new Stripe(stripeSecretKey || "sk_test_placeholder");
      let event;
      try {
        event = stripe.webhooks.constructEvent(buf, sig, stripeWebhookSecret);
      } catch (err) {
        return billingWebhookVerificationFailed(res, {
          statusCode: 400,
          code: "INVALID_STRIPE_SIGNATURE",
          message: err.message || "Invalid Stripe signature",
          location: "billingController.stripeApiWebhook",
          details: { requestId: req.requestId },
        });
      }
      req.log?.info(
        { event: "webhook_received", stripeEventId: event.id, type: event.type, billingMode },
        "stripe webhook verified"
      );
      if (await isWebhookEventProcessed("STRIPE", event.id)) {
        return sendOk(res, { received: true, duplicate: true, eventId: event.id });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const md = session.metadata || {};
        const paymentHistoryId = md.paymentHistoryId;
        if ((session.payment_status === "paid" || session.payment_status === "complete") && paymentHistoryId) {
          const result = await finalizePaidCheckout({
            provider: "STRIPE",
            providerRef: md.providerRef,
            dedupeKey: event.id,
            paymentHistoryId,
          });
          await persistStripeCredentialsFromCheckoutSession(session);
          return sendOk(res, {
            received: true,
            duplicate: Boolean(result?.skipped),
            eventId: event.id,
          });
        }
        const providerRef = md.providerRef || md.payment_ref;
        if ((session.payment_status === "paid" || session.payment_status === "complete") && providerRef) {
          const result = await finalizePaidCheckout({
            provider: "STRIPE",
            providerRef,
            dedupeKey: event.id,
          });
          await persistStripeCredentialsFromCheckoutSession(session);
          return sendOk(res, {
            received: true,
            duplicate: Boolean(result?.skipped),
            eventId: event.id,
          });
        }
        return sendOk(res, { received: true, ignored: true, reason: "checkout_not_paid_or_missing_metadata" });
      }

      if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object;
        const md = pi.metadata || {};
        if (md.paymentHistoryId) {
          await markPaymentFailedFromWebhook({
            provider: "STRIPE",
            providerRef: md.providerRef,
            dedupeKey: event.id,
            paymentHistoryId: md.paymentHistoryId,
            reason: pi.last_payment_error?.message || "payment_failed",
          });
        }
        return sendOk(res, { received: true, eventId: event.id });
      }

      return sendOk(res, {
        received: true,
        ignored: true,
        reason: "unhandled_event_type",
        type: event.type,
        eventId: event.id,
      });
    }
    let parsed;
    try {
      parsed = Buffer.isBuffer(buf) ? JSON.parse(buf.toString("utf8")) : buf;
    } catch {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_JSON",
        message: "Invalid webhook body",
        location: "billingController.stripeApiWebhook",
        details: { requestId: req.requestId },
      });
    }
    req.body = parsed;
    return stripeWebhook(req, res, next);
  } catch (error) {
    if (error.statusCode === 404) {
      return sendOk(res, { received: true, ignored: true });
    }
    return next(error);
  }
}

/** POST /api/payments/webhook/paystack — raw body for x-paystack-signature (preferred). */
async function paystackApiWebhook(req, res, next) {
  try {
    const buf = req.body;
    if (Buffer.isBuffer(buf)) {
      const sig = (req.headers["x-paystack-signature"] || "").toString();
      req.log?.info({ event: "webhook_received", route: "paystackApiWebhook", billingMode }, "paystack raw webhook");
      if (!verifyPaystackSignature(buf, sig)) {
        return billingWebhookVerificationFailed(res, {
          statusCode: 401,
          code: "INVALID_WEBHOOK_SIGNATURE",
          message: "Invalid Paystack webhook signature",
          location: "billingController.paystackApiWebhook",
          details: { requestId: req.requestId },
        });
      }
      let json;
      try {
        json = JSON.parse(buf.toString("utf8"));
      } catch {
        return sendError(res, {
          statusCode: 400,
          code: "INVALID_JSON",
          message: "Invalid webhook body",
          location: "billingController.paystackApiWebhook",
          details: { requestId: req.requestId },
        });
      }
      const eventName = json.event;
      const data = json.data || {};
      const dedupeKey =
        data.id != null ? `paystack-${data.id}` : `paystack-${eventName}-${data.reference || ""}`;
      if (await isWebhookEventProcessed("PAYSTACK", dedupeKey)) {
        return sendOk(res, { received: true, duplicate: true });
      }

      req.log?.info({ paystackEvent: eventName, reference: data.reference }, "paystack webhook payload");

      if (eventName === "charge.success") {
        const ref = data.reference;
        const paymentHistoryId = data.metadata?.paymentHistoryId;
        if (paymentHistoryId) {
          const result = await finalizePaidCheckout({
            provider: "PAYSTACK",
            providerRef: ref,
            dedupeKey,
            paymentHistoryId,
          });
          await persistPaystackAuthorizationFromCharge(data, paymentHistoryId);
          return sendOk(res, { received: true, duplicate: Boolean(result?.skipped) });
        }
        if (ref) {
          const result = await finalizePaidCheckout({
            provider: "PAYSTACK",
            providerRef: ref,
            dedupeKey,
          });
          const row = await prisma.paymentHistory.findUnique({
            where: { provider_providerRef: { provider: "PAYSTACK", providerRef: ref } },
          });
          if (row?.id) {
            await persistPaystackAuthorizationFromCharge(data, row.id);
          }
          return sendOk(res, { received: true, duplicate: Boolean(result?.skipped) });
        }
        return sendOk(res, { received: true, ignored: true });
      }

      if (eventName === "charge.failed") {
        const ref = data.reference;
        const paymentHistoryId = data.metadata?.paymentHistoryId;
        if (paymentHistoryId) {
          await markPaymentFailedFromWebhook({
            provider: "PAYSTACK",
            providerRef: ref,
            dedupeKey,
            paymentHistoryId,
            reason: data.gateway_response || "charge_failed",
          });
        } else if (ref) {
          await markPaymentFailedFromWebhook({
            provider: "PAYSTACK",
            providerRef: ref,
            dedupeKey,
            reason: data.gateway_response || "charge_failed",
          });
        }
        return sendOk(res, { received: true });
      }

      req.body = json;
      return paystackWebhook(req, res, next);
    }
    return paystackWebhook(req, res, next);
  } catch (error) {
    if (error.statusCode === 404) {
      return sendOk(res, { received: true, ignored: true });
    }
    return next(error);
  }
}

async function postCancelSubscription(req, res, next) {
  try {
    await ensureBusinessSubscription(req.auth.businessId);
    await prisma.subscription.update({
      where: { businessId: req.auth.businessId },
      data: { cancelAtPeriodEnd: true },
    });
    await recordLifecycleEvent(req.auth.businessId, "SUBSCRIPTION_CANCEL_REQUESTED", {});
    await logAudit({
      businessId: req.auth.businessId,
      userId: req.auth.userId,
      action: "SUBSCRIPTION_CANCEL_REQUESTED",
      metadata: { requestId: req.requestId },
    });
    return sendOk(res, { cancelAtPeriodEnd: true });
  } catch (error) {
    return next(error);
  }
}

async function getLifecycleEvents(req, res, next) {
  try {
    const rows = await prisma.subscriptionLifecycleEvent.findMany({
      where: { businessId: req.auth.businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return sendOk(res, { rows });
  } catch (error) {
    return next(error);
  }
}

async function getLifecycleMetrics(req, res, next) {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const byEventType = await prisma.subscriptionLifecycleEvent.groupBy({
      by: ["eventType"],
      where: { businessId: req.auth.businessId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const upgrades = await prisma.subscriptionLifecycleEvent.count({
      where: {
        businessId: req.auth.businessId,
        eventType: "SUBSCRIPTION_PAID_UPGRADE",
        createdAt: { gte: since },
      },
    });
    const trials = await prisma.subscriptionLifecycleEvent.count({
      where: {
        businessId: req.auth.businessId,
        eventType: "TRIAL_STARTED",
        createdAt: { gte: since },
      },
    });
    return sendOk(res, {
      window: { since: since.toISOString() },
      byEventType,
      trialToPaidConversionApprox: trials > 0 ? upgrades / trials : null,
    });
  } catch (error) {
    return next(error);
  }
}

async function exportPaymentsCsv(req, res, next) {
  try {
    const rows = await getPaymentHistory(req.auth.businessId);
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = "id,provider,status,plan,amount,currency,createdAt,paidAt,providerRef\n";
    const lines = rows.map((r) =>
      [
        esc(r.id),
        esc(r.provider),
        esc(r.status),
        esc(r.plan),
        esc(r.amount),
        esc(r.currency),
        esc(r.createdAt?.toISOString?.() || r.createdAt),
        esc(r.paidAt?.toISOString?.() || ""),
        esc(r.providerRef),
      ].join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="payments.csv"');
    return res.send(header + lines.join("\n"));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCurrentSubscription,
  postCheckoutSession,
  stripeWebhook,
  paystackWebhook,
  stripeApiWebhook,
  paystackApiWebhook,
  listPayments,
  confirmPayment,
  postCancelSubscription,
  getLifecycleEvents,
  getLifecycleMetrics,
  exportPaymentsCsv,
};
