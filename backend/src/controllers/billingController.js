const { z } = require("zod");
const {
  createCheckoutSession,
  markSubscriptionPaid,
  verifyWebhookSignature,
  getPaymentHistory,
  confirmPaymentForBusiness,
} = require("../services/paymentService");
const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { sendOk, sendError } = require("../utils/http");

const checkoutSchema = z.object({
  plan: z.enum(["FREE", "BASIC", "PREMIUM"]),
  provider: z.enum(["STRIPE", "PAYSTACK"]),
});
const confirmSchema = z.object({
  providerRef: z.string().min(5),
  provider: z.enum(["STRIPE", "PAYSTACK"]),
  plan: z.enum(["FREE", "BASIC", "PREMIUM"]),
});

async function getCurrentSubscription(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    return sendOk(res, sub);
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
    });
    return sendOk(res, data, 201);
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
    const signature = req.headers["x-posflyt-signature"] || "";
    const bodyString = JSON.stringify(req.body || {});
    if (!verifyWebhookSignature("STRIPE", bodyString, signature)) {
      return sendError(res, {
        statusCode: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: "Invalid webhook signature",
        location: "controllers/billingController.stripeWebhook",
        details: { requestId: req.requestId },
      });
    }

    const { providerRef, businessId, plan, status } = req.body || {};
    if (status === "PAID" && providerRef && businessId && plan) {
      await markSubscriptionPaid({ providerRef, provider: "STRIPE", businessId, plan });
    }
    return sendOk(res, { received: true });
  } catch (error) {
    return next(error);
  }
}

async function paystackWebhook(req, res, next) {
  try {
    const signature = req.headers["x-posflyt-signature"] || "";
    const bodyString = JSON.stringify(req.body || {});
    if (!verifyWebhookSignature("PAYSTACK", bodyString, signature)) {
      return sendError(res, {
        statusCode: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: "Invalid webhook signature",
        location: "controllers/billingController.paystackWebhook",
        details: { requestId: req.requestId },
      });
    }

    const { providerRef, businessId, plan, status } = req.body || {};
    if (status === "PAID" && providerRef && businessId && plan) {
      await markSubscriptionPaid({ providerRef, provider: "PAYSTACK", businessId, plan });
    }
    return sendOk(res, { received: true });
  } catch (error) {
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

module.exports = {
  getCurrentSubscription,
  postCheckoutSession,
  stripeWebhook,
  paystackWebhook,
  listPayments,
  confirmPayment,
};
