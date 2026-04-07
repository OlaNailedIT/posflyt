const crypto = require("crypto");
const prisma = require("../config/prisma");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { logAudit } = require("./auditService");
const { logger } = require("../utils/logger");
const { PLAN_PRICING, getPlanCurrency } = require("../constants/billingConstants");
const {
  stripeSecretKey,
  paystackSecretKey,
  appBaseUrl,
} = require("../config/env");
const { paymentProviderOutbound } = require("../utils/billingCircuitBreakers");
const { incrementBillingFailedPayments } = require("./runtimeMetricsService");

/**
 * Creates a payment intent row and returns a hosted checkout URL from Stripe or Paystack when keys are configured.
 * Idempotency: same business + clientRequestId reuses an existing pending intent for that session.
 */
async function createPaymentIntent({ businessId, plan, provider, clientRequestId }) {
  await ensureBusinessSubscription(businessId);
  const sub = await prisma.subscription.findUnique({ where: { businessId } });
  const listPrice = PLAN_PRICING[plan];
  if (listPrice === undefined) {
    const error = new Error("Invalid plan");
    error.statusCode = 400;
    throw error;
  }

  if (clientRequestId) {
    const existing = await prisma.paymentHistory.findFirst({
      where: {
        businessId,
        clientRequestId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const meta = (existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}) || {};
      const url = meta.checkoutUrl || buildFallbackReturnUrl(existing.providerRef, existing.provider, existing.plan);
      logger.info(
        {
          event: "payment_intent_duplicate_session",
          paymentId: existing.id,
          businessId,
          clientRequestId,
        },
        "reusing pending payment intent for same session"
      );
      return {
        redirectUrl: url,
        reference: existing.providerRef,
        idempotencyKey: existing.idempotencyKey,
        paymentHistoryId: existing.id,
        duplicateSession: true,
      };
    }
  }

  let amount = listPrice;
  let prorationMeta = null;
  if (
    sub &&
    sub.plan !== "FREE" &&
    plan !== sub.plan &&
    listPrice > 0 &&
    sub.expiresAt &&
    new Date(sub.expiresAt).getTime() > Date.now()
  ) {
    const oldPrice = PLAN_PRICING[sub.plan] || 0;
    const newPrice = listPrice;
    const periodMs = 30 * 86400000;
    const remaining = Math.max(0, new Date(sub.expiresAt).getTime() - Date.now());
    const credit = (remaining / periodMs) * oldPrice;
    const charge = Math.max(0, Math.round((newPrice - credit) * 100) / 100);
    amount = charge;
    prorationMeta = {
      proration: true,
      previousPlan: sub.plan,
      targetPlan: plan,
      remainingMs: remaining,
      creditApplied: Math.round(credit * 100) / 100,
      listPrice: newPrice,
    };
    await logAudit({
      businessId,
      action: "BILLING_PRORATION_CHECKOUT",
      metadata: { ...prorationMeta, provider },
    });
  }

  const idempotencyKey = crypto.randomUUID();
  const providerRef = `sub_${provider}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date();
  const currency = getPlanCurrency(plan);

  const settings = await prisma.settings.findUnique({ where: { businessId } });
  const paystackEmail = settings?.businessEmail || "billing@posflyt.local";

  const payment = await prisma.paymentHistory.create({
    data: {
      businessId,
      provider,
      providerRef,
      plan,
      amount,
      metadata: prorationMeta || undefined,
      currency,
      status: "pending",
      clientRequestId: clientRequestId || null,
      lastRetryAt: now,
      idempotencyKey,
    },
  });

  logger.info(
    {
      event: "payment_created",
      paymentId: payment.id,
      businessId,
      provider,
      providerRef,
      idempotencyKey,
      amount,
      currency,
      status: "pending",
    },
    "payment intent created"
  );

  let redirectUrl;
  let providerMetadata = {};

  if ((provider === "STRIPE" && stripeSecretKey) || (provider === "PAYSTACK" && paystackSecretKey)) {
    if (!paymentProviderOutbound.allow()) {
      await prisma.paymentHistory.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: "payment_provider_circuit_open" },
      });
      incrementBillingFailedPayments(1);
      const err = new Error("Payment provider temporarily unavailable");
      err.statusCode = 503;
      throw err;
    }
  }

  if (provider === "STRIPE" && stripeSecretKey) {
    // eslint-disable-next-line global-require
    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecretKey);
    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: { name: `POSflyt ${plan}` },
                unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
            },
          ],
          success_url: `${appBaseUrl}/billing/return?payment_ref=${encodeURIComponent(providerRef)}&provider=STRIPE&plan=${plan}`,
          cancel_url: `${appBaseUrl}/billing?payment_status=failed`,
          client_reference_id: providerRef,
          metadata: {
            paymentHistoryId: payment.id,
            providerRef,
            businessId,
            plan,
          },
          payment_intent_data: {
            metadata: { paymentHistoryId: payment.id, providerRef, businessId, plan },
          },
        },
        { idempotencyKey }
      );
      paymentProviderOutbound.recordSuccess();
    } catch (e) {
      paymentProviderOutbound.recordFailure();
      await prisma.paymentHistory.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          failureReason: e.message || "stripe_checkout_failed",
        },
      });
      incrementBillingFailedPayments(1);
      throw e;
    }
    redirectUrl = session.url;
    providerMetadata = { stripeCheckoutSessionId: session.id };
  } else if (provider === "PAYSTACK" && paystackSecretKey) {
    let res;
    try {
      res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: providerRef,
        amount: Math.round(amount * 100),
        email: paystackEmail,
        currency,
        callback_url: `${appBaseUrl}/billing/return?payment_ref=${encodeURIComponent(providerRef)}&provider=PAYSTACK&plan=${plan}`,
        metadata: {
          paymentHistoryId: payment.id,
          businessId,
          plan,
          providerRef,
        },
      }),
    });
    } catch (e) {
      paymentProviderOutbound.recordFailure();
      await prisma.paymentHistory.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: e.message || "paystack_fetch_failed" },
      });
      incrementBillingFailedPayments(1);
      throw e;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.status || !body?.data?.authorization_url) {
      paymentProviderOutbound.recordFailure();
      logger.error(
        { event: "paystack_init_failed", paymentId: payment.id, status: res.status, body },
        "Paystack initialize failed"
      );
      await prisma.paymentHistory.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          failureReason: body?.message || `paystack_http_${res.status}`,
        },
      });
      incrementBillingFailedPayments(1);
      const err = new Error(body?.message || "Paystack checkout could not be started");
      err.statusCode = 502;
      throw err;
    }
    paymentProviderOutbound.recordSuccess();
    redirectUrl = body.data.authorization_url;
    providerMetadata = {
      paystackAccessCode: body.data.access_code,
      paystackReference: providerRef,
    };
  } else {
    redirectUrl = buildFallbackReturnUrl(providerRef, provider, plan);
  }

  const mergedMeta = {
    ...(prorationMeta || {}),
    checkoutUrl: redirectUrl,
  };

  await prisma.paymentHistory.update({
    where: { id: payment.id },
    data: {
      metadata: mergedMeta,
      providerMetadata,
    },
  });

  logger.info(
    {
      event: "payment_checkout_ready",
      paymentId: payment.id,
      businessId,
      provider,
      hasHostedUrl: Boolean(redirectUrl && !redirectUrl.includes("/billing/return")),
    },
    "checkout URL ready"
  );

  return {
    redirectUrl,
    reference: providerRef,
    idempotencyKey,
    paymentHistoryId: payment.id,
    duplicateSession: false,
  };
}

function buildFallbackReturnUrl(providerRef, provider, plan) {
  return `${appBaseUrl}/billing/return?payment_ref=${encodeURIComponent(providerRef)}&provider=${provider}&plan=${plan}`;
}

module.exports = { createPaymentIntent, buildFallbackReturnUrl };
