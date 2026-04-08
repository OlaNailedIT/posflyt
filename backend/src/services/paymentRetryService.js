const crypto = require("crypto");
const prisma = require("../config/prisma");
const {
  paymentRetryMaxAttempts,
  slackBillingWebhookUrl,
  stripeSecretKey,
  paystackSecretKey,
  appBaseUrl,
} = require("../config/env");
const { logger } = require("../utils/logger");
const { incrementBillingFailedPayments, incrementBillingRetryAttempts } = require("./runtimeMetricsService");
const { getRedisClient } = require("../config/redis");
const { finalizePaidCheckout } = require("./paymentService");
const { getPlanCurrency } = require("../constants/billingConstants");

const LOCK_KEY = "posflyt:payment-retry-lock";
const LOCK_TTL_SEC = 90;
const STALE_PENDING_MS = 48 * 60 * 60 * 1000;

let inProcessLock = false;

async function acquireRetryLock() {
  const redis = getRedisClient();
  if (redis) {
    const token = crypto.randomBytes(8).toString("hex");
    const ok = await redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SEC, "NX");
    return ok === "OK" ? { redis, token } : null;
  }
  if (inProcessLock) return null;
  inProcessLock = true;
  return { inProcess: true };
}

async function releaseRetryLock(handle) {
  if (handle?.redis && handle.token) {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    try {
      await handle.redis.eval(script, 1, LOCK_KEY, handle.token);
    } catch (e) {
      logger.warn({ err: e.message }, "payment retry lock release failed");
    }
    return;
  }
  if (handle?.inProcess) {
    inProcessLock = false;
  }
}

/**
 * Marks very old pending payments as failed so they do not stay pending forever.
 */
async function expireStalePendingPayments() {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);
  const stale = await prisma.paymentHistory.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      failureReason: "stale_pending_timeout",
      nextRetryAt: new Date(Date.now() + 60_000),
    },
  });
  if (stale.count > 0) {
    logger.warn({ count: stale.count, event: "stale_pending_expired" }, "marked stale pending payments as failed");
  }
  return stale.count;
}

async function findReusableStripePaymentMethod(businessId) {
  const paid = await prisma.paymentHistory.findFirst({
    where: { businessId, provider: "STRIPE", status: "paid" },
    orderBy: { paidAt: "desc" },
  });
  const meta = paid?.providerMetadata;
  if (meta && typeof meta === "object" && meta.stripePaymentMethodId && meta.stripeCustomerId) {
    return { customerId: meta.stripeCustomerId, paymentMethodId: meta.stripePaymentMethodId };
  }
  return null;
}

async function findReusablePaystackAuthorization(businessId) {
  const paid = await prisma.paymentHistory.findFirst({
    where: { businessId, provider: "PAYSTACK", status: "paid" },
    orderBy: { paidAt: "desc" },
  });
  const meta = paid?.providerMetadata;
  if (meta && typeof meta === "object" && meta.paystackAuthorizationCode && meta.paystackCustomerEmail) {
    return {
      authorizationCode: meta.paystackAuthorizationCode,
      email: meta.paystackCustomerEmail,
    };
  }
  return null;
}

async function attemptStripeOffSessionCharge(payment, pm) {
  // eslint-disable-next-line global-require
  const Stripe = require("stripe");
  const stripe = new Stripe(stripeSecretKey);
  const currency = (payment.currency || "USD").toLowerCase();
  const idempotencyKey = `retry-charge-${payment.id}-${payment.retryCount + 1}`;
  const pi = await stripe.paymentIntents.create(
    {
      amount: Math.round(payment.amount * 100),
      currency,
      customer: pm.customerId,
      payment_method: pm.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        paymentHistoryId: payment.id,
        businessId: payment.businessId,
        providerRef: payment.providerRef,
      },
    },
    { idempotencyKey }
  );
  return pi;
}

async function attemptPaystackChargeAuthorization(payment, auth) {
  const res = await fetch("https://api.paystack.co/transaction/charge_authorization", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_code: auth.authorizationCode,
      email: auth.email,
      amount: Math.round(payment.amount * 100),
      reference: `${payment.providerRef}_r${payment.retryCount + 1}_${crypto.randomBytes(4).toString("hex")}`,
      metadata: {
        paymentHistoryId: payment.id,
        businessId: payment.businessId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.status === true && body?.data?.status === "success", body };
}

async function reinitializeHostedCheckout(payment) {
  const currency = getPlanCurrency(payment.plan);
  const settings = await prisma.settings.findUnique({ where: { businessId: payment.businessId } });
  const email = settings?.businessEmail || "billing@posflyt.local";

  if (payment.provider === "STRIPE" && stripeSecretKey) {
    // eslint-disable-next-line global-require
    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecretKey);
    const newRef = `${payment.providerRef}_r${payment.retryCount + 1}_${crypto.randomBytes(4).toString("hex")}`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: { name: `POSflyt ${payment.plan} (retry)` },
              unit_amount: Math.round(payment.amount * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${appBaseUrl}/billing/return?payment_ref=${encodeURIComponent(newRef)}&provider=STRIPE&plan=${payment.plan}`,
        cancel_url: `${appBaseUrl}/billing?payment_status=failed`,
        client_reference_id: newRef,
        metadata: {
          paymentHistoryId: payment.id,
          providerRef: newRef,
          businessId: payment.businessId,
          plan: payment.plan,
        },
        payment_intent_data: {
          metadata: { paymentHistoryId: payment.id, providerRef: newRef, businessId: payment.businessId, plan: payment.plan },
        },
      },
      { idempotencyKey: `retry-session-${payment.id}-${payment.retryCount + 1}` }
    );
    return { type: "stripe_session", url: session.url, newProviderRef: newRef, stripeCheckoutSessionId: session.id };
  }

  if (payment.provider === "PAYSTACK" && paystackSecretKey) {
    const newRef = `${payment.providerRef}_r${payment.retryCount + 1}_${crypto.randomBytes(4).toString("hex")}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: newRef,
        amount: Math.round(payment.amount * 100),
        email,
        currency,
        callback_url: `${appBaseUrl}/billing/return?payment_ref=${encodeURIComponent(newRef)}&provider=PAYSTACK&plan=${payment.plan}`,
        metadata: {
          paymentHistoryId: payment.id,
          businessId: payment.businessId,
          plan: payment.plan,
          providerRef: newRef,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.status || !body?.data?.authorization_url) {
      return { type: "error", message: body?.message || `paystack_${res.status}` };
    }
    return {
      type: "paystack_init",
      url: body.data.authorization_url,
      newProviderRef: newRef,
      paystackAccessCode: body.data.access_code,
    };
  }

  return { type: "noop", message: "no_provider_keys" };
}

/**
 * Processes failed/retrying payments: off-session charge when credentials exist, otherwise new hosted checkout.
 */
async function processDuePaymentRetries() {
  await expireStalePendingPayments();

  const lock = await acquireRetryLock();
  if (!lock) {
    logger.info({ event: "payment_retry_skipped" }, "another retry worker holds the lock");
    return { processed: 0, items: [], skipped: "locked" };
  }

  const now = new Date();
  const due = await prisma.paymentHistory.findMany({
    where: {
      status: { in: ["failed", "retrying"] },
      retryCount: { lt: paymentRetryMaxAttempts },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    take: 25,
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
  });

  const items = [];

  try {
    for (const row of due) {
      incrementBillingRetryAttempts(1);
      const nextRetryCount = row.retryCount + 1;
      const lastRetry = new Date();

      logger.info(
        {
          event: "payment_retry_attempt",
          paymentId: row.id,
          provider: row.provider,
          retryCount: nextRetryCount,
          providerRef: row.providerRef,
        },
        "processing payment retry"
      );

      if (row.status === "paid") {
        items.push({ id: row.id, skipped: true, reason: "already_paid" });
        continue;
      }

        try {
        if (row.provider === "STRIPE" && stripeSecretKey) {
          const pm = await findReusableStripePaymentMethod(row.businessId);
          if (pm) {
            try {
              const pi = await attemptStripeOffSessionCharge(row, pm);
              if (pi.status === "succeeded") {
                await finalizePaidCheckout({
                  provider: "STRIPE",
                  providerRef: row.providerRef,
                  dedupeKey: `retry-pi-${pi.id}`,
                  paymentHistoryId: row.id,
                });
                items.push({ id: row.id, result: "paid_via_pi" });
                continue;
              }
            } catch (e) {
              logger.warn({ err: e.message, paymentId: row.id }, "stripe off-session retry failed; trying hosted checkout");
            }
          }
        }

        if (row.provider === "PAYSTACK" && paystackSecretKey) {
          const auth = await findReusablePaystackAuthorization(row.businessId);
          if (auth) {
            try {
              const { ok, body } = await attemptPaystackChargeAuthorization(row, auth);
              if (ok) {
                await finalizePaidCheckout({
                  provider: "PAYSTACK",
                  providerRef: row.providerRef,
                  dedupeKey: `retry-charge-${body?.data?.id || row.id}`,
                  paymentHistoryId: row.id,
                });
                items.push({ id: row.id, result: "paid_via_charge" });
                continue;
              }
            } catch (e) {
              logger.warn({ err: e.message, paymentId: row.id }, "paystack charge retry failed; trying hosted checkout");
            }
          }
        }

        const hosted = await reinitializeHostedCheckout(row);
        if (hosted.type === "error" || hosted.type === "noop") {
          const failReason = hosted.message || "retry_hosted_failed";
          const willCancel = nextRetryCount >= paymentRetryMaxAttempts;
          await prisma.paymentHistory.update({
            where: { id: row.id },
            data: {
              retryCount: nextRetryCount,
              lastRetryAt: lastRetry,
              status: willCancel ? "canceled" : "retrying",
              failureReason: failReason,
              nextRetryAt: willCancel
                ? null
                : new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** nextRetryCount)),
            },
          });
          if (willCancel) {
            await notifyPermanentFailure(row, failReason);
          }
          items.push({ id: row.id, result: willCancel ? "canceled" : "retrying", reason: failReason });
          continue;
        }

        const newRef = hosted.newProviderRef;
        const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) || {};
        await prisma.paymentHistory.update({
          where: { id: row.id },
          data: {
            providerRef: newRef,
            retryCount: nextRetryCount,
            lastRetryAt: lastRetry,
            status: "retrying",
            failureReason: null,
            nextRetryAt: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** nextRetryCount)),
            metadata: { ...meta, checkoutUrl: hosted.url, retryInitiatedAt: lastRetry.toISOString() },
            providerMetadata: {
              ...(typeof row.providerMetadata === "object" && row.providerMetadata ? row.providerMetadata : {}),
              ...(hosted.stripeCheckoutSessionId
                ? { stripeCheckoutSessionId: hosted.stripeCheckoutSessionId }
                : {}),
              ...(hosted.paystackAccessCode ? { paystackAccessCode: hosted.paystackAccessCode } : {}),
            },
          },
        });
        items.push({ id: row.id, result: "retrying", newProviderRef: newRef });
      } catch (err) {
        logger.error({ err: err.message, paymentId: row.id }, "payment retry attempt failed");
        const willCancel = nextRetryCount >= paymentRetryMaxAttempts;
        await prisma.paymentHistory.update({
          where: { id: row.id },
          data: {
            retryCount: nextRetryCount,
            lastRetryAt: lastRetry,
            status: willCancel ? "canceled" : "retrying",
            failureReason: err.message || "retry_error",
            nextRetryAt: willCancel
              ? null
              : new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** nextRetryCount)),
          },
        });
        if (willCancel) {
          await notifyPermanentFailure(row, err.message);
        }
        items.push({ id: row.id, result: willCancel ? "canceled" : "retrying", error: err.message });
      }
    }

    return { processed: items.length, items };
  } finally {
    await releaseRetryLock(lock);
  }
}

async function notifyPermanentFailure(paymentRow, reason) {
  if (!slackBillingWebhookUrl) return;
  try {
    const text =
      `POSflyt billing: payment ${paymentRow.providerRef} permanently failed (${reason}). ` +
      `clientRequestId=${paymentRow.clientRequestId || "n/a"}`;
    await fetch(slackBillingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    logger.warn({ err: e.message }, "slack billing alert failed");
  }
}

module.exports = {
  processDuePaymentRetries,
  notifyPermanentFailure,
  paymentRetryMaxAttempts,
  expireStalePendingPayments,
  acquireRetryLock,
  releaseRetryLock,
};
