const crypto = require("crypto");
const prisma = require("../config/prisma");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { recordLifecycleEvent } = require("./subscriptionLifecycleService");
const { logAudit } = require("./auditService");
const { logger } = require("../utils/logger");
const { incrementBillingFailedPayments } = require("./runtimeMetricsService");
const { createPaymentIntent } = require("./paymentIntentService");
const { PLAN_PRICING } = require("../constants/billingConstants");
const {
  stripeSecretKey,
  paystackSecretKey,
  stripeWebhookSecret,
  paystackWebhookSecret,
  nodeEnv,
  requireBillingWebhookSignature,
} = require("../config/env");

const isProd = (nodeEnv || process.env.NODE_ENV || "development") === "production";

async function createCheckoutSession({ businessId, plan, provider, clientRequestId }) {
  return createPaymentIntent({ businessId, plan, provider, clientRequestId });
}

/**
 * Resolve payment row by internal id (preferred) or provider + ref.
 */
async function resolvePaymentRow({ provider, providerRef, paymentHistoryId }) {
  if (paymentHistoryId) {
    return prisma.paymentHistory.findUnique({ where: { id: paymentHistoryId } });
  }
  if (provider && providerRef) {
    return prisma.paymentHistory.findUnique({
      where: { provider_providerRef: { provider, providerRef } },
    });
  }
  return null;
}

async function isWebhookEventProcessed(provider, dedupeKey) {
  if (!dedupeKey) return false;
  const row = await prisma.billingWebhookEvent.findUnique({
    where: { provider_dedupeKey: { provider, dedupeKey } },
  });
  return Boolean(row);
}

/**
 * Mark a pending checkout as paid and activate the subscription (idempotent).
 * Duplicate gateway deliveries: claim `BillingWebhookEvent` first (dedupeKey = gateway event id when provided).
 * Authoritative businessId and plan come from PaymentHistory, not from the webhook body.
 *
 * @param {{ provider: string, providerRef?: string, dedupeKey?: string, paymentHistoryId?: string }} params
 */
async function finalizePaidCheckout({ provider, providerRef, dedupeKey, paymentHistoryId }) {
  const dk = dedupeKey || providerRef;

  const payment = await resolvePaymentRow({ provider, providerRef, paymentHistoryId });
  if (!payment) {
    const err = new Error("Payment reference not found");
    err.statusCode = 404;
    throw err;
  }

  if (payment.status === "paid") {
    logger.info(
      { event: "payment_webhook_skip", paymentId: payment.id, reason: "already_paid" },
      "finalize skipped — already paid"
    );
    return { skipped: true, businessId: payment.businessId };
  }

  if (payment.status === "canceled") {
    return { skipped: true, businessId: payment.businessId };
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);

  const { plan, businessId } = payment;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.billingWebhookEvent.create({
        data: {
          provider,
          dedupeKey: dk,
          businessId,
          outcome: "SUCCESS",
          metadata: { providerRef: payment.providerRef, plan, paymentHistoryId: payment.id },
        },
      });

      const updated = await tx.paymentHistory.updateMany({
        where: {
          id: payment.id,
          status: { in: ["pending", "retrying", "failed"] },
        },
        data: {
          status: "paid",
          paidAt: now,
          gatewayEventId: dk,
          failureReason: null,
          nextRetryAt: null,
        },
      });

      if (updated.count === 0) {
        const again = await tx.paymentHistory.findUnique({ where: { id: payment.id } });
        if (again?.status === "paid") {
          const skip = new Error("RECONCILE_SKIP");
          skip.code = "RECONCILE_SKIP";
          throw skip;
        }
        const err = new Error("Payment is not pending or retrying");
        err.statusCode = 409;
        throw err;
      }

      await tx.subscription.upsert({
        where: { businessId },
        update: {
          plan,
          status: "ACTIVE",
          provider,
          externalRef: payment.providerRef,
          expiresAt,
          trialEndsAt: null,
          graceEndsAt: null,
          cancelAtPeriodEnd: false,
        },
        create: {
          businessId,
          plan,
          status: "ACTIVE",
          provider,
          externalRef: payment.providerRef,
          expiresAt,
        },
      });
    });
  } catch (e) {
    if (e.code === "P2002") {
      logger.info({ provider, dedupeKey: dk, providerRef: payment.providerRef }, "duplicate gateway event (idempotent skip)");
      const again = await prisma.paymentHistory.findUnique({ where: { id: payment.id } });
      if (again?.status === "paid") {
        return { skipped: true, businessId: again.businessId };
      }
      return { skipped: true, businessId: payment.businessId };
    }
    if (e.code === "RECONCILE_SKIP" || e.message === "RECONCILE_SKIP") {
      return { skipped: true, businessId: payment.businessId };
    }
    throw e;
  }

  logger.info(
    {
      event: "payment_final_state",
      paymentId: payment.id,
      businessId,
      status: "paid",
      provider,
    },
    "payment marked paid and subscription activated"
  );

  await logAudit({
    businessId,
    userId: null,
    action: "BILLING_PAYMENT_SUCCEEDED",
    metadata: {
      provider,
      providerRef: payment.providerRef,
      plan,
      dedupeKey: dk,
      amount: payment.amount,
      proration: payment.metadata ?? null,
    },
  });

  await recordLifecycleEvent(businessId, "SUBSCRIPTION_PAID_UPGRADE", {
    provider,
    providerRef: payment.providerRef,
    plan,
    dedupeKey: dk,
  });

  return { skipped: false, businessId };
}

/**
 * Record a failed charge from the gateway without altering an active subscription.
 */
async function markPaymentFailedFromWebhook({ provider, providerRef, dedupeKey, paymentHistoryId, reason }) {
  const dk = dedupeKey || providerRef || crypto.randomUUID();
  const payment = await resolvePaymentRow({ provider, providerRef, paymentHistoryId });
  if (!payment) {
    const err = new Error("Payment reference not found");
    err.statusCode = 404;
    throw err;
  }

  if (payment.status === "paid") {
    logger.warn(
      { event: "payment_failure_ignored", paymentId: payment.id, reason: "already_paid" },
      "ignoring failure webhook — payment already paid (subscription unchanged)"
    );
    return { skipped: true, businessId: payment.businessId };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.billingWebhookEvent.create({
        data: {
          provider,
          dedupeKey: dk,
          businessId: payment.businessId,
          outcome: "SUCCESS",
          metadata: { type: "failure", providerRef: payment.providerRef, paymentHistoryId: payment.id, reason },
        },
      });

      await tx.paymentHistory.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          failureReason: reason || "gateway_failed",
          gatewayEventId: dk,
          nextRetryAt: new Date(Date.now() + 60_000),
        },
      });
    });
  } catch (e) {
    if (e.code === "P2002") {
      return { skipped: true, businessId: payment.businessId };
    }
    throw e;
  }

  logger.info(
    {
      event: "payment_final_state",
      paymentId: payment.id,
      businessId: payment.businessId,
      status: "failed",
      provider,
    },
    "payment marked failed from webhook"
  );

  incrementBillingFailedPayments(1);
  return { skipped: false, businessId: payment.businessId };
}

/** Legacy name — delegates to finalizePaidCheckout after validating caller-supplied fields. */
async function markSubscriptionPaid({ providerRef, provider, businessId, plan }) {
  const payment = await prisma.paymentHistory.findUnique({
    where: { provider_providerRef: { provider, providerRef } },
  });
  if (!payment) {
    const err = new Error("Payment reference not found");
    err.statusCode = 404;
    throw err;
  }
  if (payment.businessId !== businessId) {
    const err = new Error("Payment does not belong to this business");
    err.statusCode = 403;
    throw err;
  }
  if (payment.plan !== plan) {
    const err = new Error("Plan does not match checkout session");
    err.statusCode = 400;
    throw err;
  }
  return finalizePaidCheckout({ provider, providerRef, dedupeKey: providerRef });
}

async function confirmPaymentForBusiness({ businessId, providerRef, provider, plan }) {
  const payment = await prisma.paymentHistory.findUnique({
    where: { provider_providerRef: { provider, providerRef } },
  });
  if (!payment) {
    const err = new Error("Payment reference not found");
    err.statusCode = 404;
    throw err;
  }
  if (payment.businessId !== businessId) {
    const err = new Error("Payment does not belong to this business");
    err.statusCode = 403;
    throw err;
  }
  if (payment.plan !== plan) {
    const err = new Error("Plan does not match checkout session");
    err.statusCode = 400;
    throw err;
  }
  await finalizePaidCheckout({ provider, providerRef, dedupeKey: `confirm:${providerRef}` });
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  return subscription;
}

/**
 * @param {string} provider STRIPE | PAYSTACK
 * @param {string|Buffer} bodyString raw or JSON string
 * @param {string} signatureHeader legacy x-posflyt-signature OR stripe-signature handled elsewhere
 */
function verifyWebhookSignature(provider, bodyString, signatureHeader) {
  const strict = requireBillingWebhookSignature || isProd;
  if (provider === "STRIPE") {
    if (!stripeWebhookSecret) {
      return !strict;
    }
    const expected = crypto.createHmac("sha256", stripeWebhookSecret).update(bodyString).digest("hex");
    return signatureHeader === expected;
  }
  if (provider === "PAYSTACK") {
    if (!paystackWebhookSecret) {
      return !strict;
    }
    const expected = crypto.createHmac("sha512", paystackWebhookSecret).update(bodyString).digest("hex");
    return signatureHeader === expected;
  }
  return false;
}

/** Paystack official header `x-paystack-signature` (hex). */
function verifyPaystackSignature(bodyBuffer, signatureHeader) {
  const strict = requireBillingWebhookSignature || isProd;
  if (!paystackWebhookSecret) {
    return !strict;
  }
  if (!signatureHeader || !bodyBuffer) return false;
  const expected = crypto.createHmac("sha512", paystackWebhookSecret).update(bodyBuffer).digest("hex");
  return expected === signatureHeader;
}

async function getPaymentHistory(businessId) {
  return prisma.paymentHistory.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** After successful Stripe Checkout, persist customer + payment method for off-session retries. */
async function persistStripeCredentialsFromCheckoutSession(session) {
  const paymentHistoryId = session.metadata?.paymentHistoryId;
  if (!paymentHistoryId || !stripeSecretKey) return;

  // eslint-disable-next-line global-require
  const Stripe = require("stripe");
  const stripe = new Stripe(stripeSecretKey);
  let customerId = session.customer || null;
  if (typeof customerId !== "string") {
    customerId = customerId?.id || null;
  }
  let pmId = null;
  const piId = session.payment_intent;
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(typeof piId === "string" ? piId : piId.id);
    pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
    if (!customerId) {
      const c = pi.customer;
      customerId = typeof c === "string" ? c : c?.id || null;
    }
  }

  const row = await prisma.paymentHistory.findUnique({ where: { id: paymentHistoryId } });
  if (!row) return;
  const prev = row.providerMetadata && typeof row.providerMetadata === "object" ? row.providerMetadata : {};
  await prisma.paymentHistory.update({
    where: { id: paymentHistoryId },
    data: {
      providerMetadata: {
        ...prev,
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: customerId,
        stripePaymentMethodId: pmId,
      },
    },
  });
}

/** After Paystack charge.success, store authorization code for charge retries. */
async function persistPaystackAuthorizationFromCharge(chargeData, paymentHistoryId) {
  if (!paymentHistoryId) return;
  const auth = chargeData?.authorization;
  const code = auth?.authorization_code;
  const cust = chargeData?.customer;
  const email = typeof cust === "object" && cust ? cust.email : null;
  if (!code) return;

  const row = await prisma.paymentHistory.findUnique({ where: { id: paymentHistoryId } });
  if (!row) return;
  const prev = row.providerMetadata && typeof row.providerMetadata === "object" ? row.providerMetadata : {};
  await prisma.paymentHistory.update({
    where: { id: paymentHistoryId },
    data: {
      providerMetadata: {
        ...prev,
        paystackAuthorizationCode: code,
        ...(email ? { paystackCustomerEmail: email } : {}),
      },
    },
  });
}

module.exports = {
  PLAN_PRICING,
  createCheckoutSession,
  finalizePaidCheckout,
  markPaymentFailedFromWebhook,
  isWebhookEventProcessed,
  resolvePaymentRow,
  /** @deprecated Prefer finalizePaidCheckout */
  markSubscriptionPaid,
  verifyWebhookSignature,
  verifyPaystackSignature,
  getPaymentHistory,
  confirmPaymentForBusiness,
  persistStripeCredentialsFromCheckoutSession,
  persistPaystackAuthorizationFromCharge,
};
