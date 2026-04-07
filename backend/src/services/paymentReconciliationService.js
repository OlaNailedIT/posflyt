const prisma = require("../config/prisma");
const { stripeSecretKey, paystackSecretKey } = require("../config/env");
const { logger } = require("../utils/logger");
const { finalizePaidCheckout, persistStripeCredentialsFromCheckoutSession, persistPaystackAuthorizationFromCharge } =
  require("./paymentService");

/**
 * Compares recent paid rows with provider APIs (best-effort). Scoped to one business.
 */
async function reconcilePaymentsForBusiness(businessId) {
  const discrepancies = [];

  const paid = await prisma.paymentHistory.findMany({
    where: { businessId, status: "paid" },
    take: 50,
    orderBy: { paidAt: "desc" },
  });

  if (stripeSecretKey) {
    // eslint-disable-next-line global-require
    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecretKey);
    for (const p of paid.filter((x) => x.provider === "STRIPE")) {
      const sid = p.providerMetadata?.stripeCheckoutSessionId;
      if (!sid) continue;
      try {
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (s.payment_status && s.payment_status !== "paid" && s.payment_status !== "complete") {
          discrepancies.push({
            kind: "internal_paid_provider_not_confirmed",
            paymentId: p.id,
            provider: "STRIPE",
            providerStatus: s.payment_status,
          });
        }
      } catch (e) {
        logger.warn({ err: e.message, paymentId: p.id }, "stripe reconciliation lookup failed");
        discrepancies.push({ kind: "provider_lookup_error", paymentId: p.id, provider: "STRIPE", error: e.message });
      }
    }
  }

  if (paystackSecretKey) {
    for (const p of paid.filter((x) => x.provider === "PAYSTACK")) {
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.providerRef)}`, {
          headers: { Authorization: `Bearer ${paystackSecretKey}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!body?.status || body?.data?.status !== "success") {
          discrepancies.push({
            kind: "internal_paid_provider_not_confirmed",
            paymentId: p.id,
            provider: "PAYSTACK",
            detail: body?.message || body?.data?.status,
          });
        }
      } catch (e) {
        discrepancies.push({ kind: "provider_lookup_error", paymentId: p.id, provider: "PAYSTACK", error: e.message });
      }
    }
  }

  const pendingRows = await prisma.paymentHistory.findMany({
    where: { businessId, status: "pending" },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  for (const p of pendingRows) {
    if (p.provider === "PAYSTACK" && paystackSecretKey) {
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.providerRef)}`, {
          headers: { Authorization: `Bearer ${paystackSecretKey}` },
        });
        const body = await res.json().catch(() => ({}));
        if (body?.status === true && body?.data?.status === "success") {
          discrepancies.push({
            kind: "provider_paid_internal_not_paid",
            paymentId: p.id,
            provider: "PAYSTACK",
            detail: "verify returned success while row is pending",
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (p.provider === "STRIPE" && stripeSecretKey && p.providerMetadata?.stripeCheckoutSessionId) {
      try {
        // eslint-disable-next-line global-require
        const Stripe = require("stripe");
        const stripe = new Stripe(stripeSecretKey);
        const s = await stripe.checkout.sessions.retrieve(p.providerMetadata.stripeCheckoutSessionId);
        if (s.payment_status === "paid" || s.payment_status === "complete") {
          discrepancies.push({
            kind: "provider_paid_internal_not_paid",
            paymentId: p.id,
            provider: "STRIPE",
            detail: `checkout session ${s.payment_status} while row is pending`,
          });
        }
      } catch (e) {
        logger.warn({ err: e.message, paymentId: p.id }, "stripe pending session lookup failed");
      }
    }
  }

  return { discrepancies, checkedAt: new Date().toISOString(), sampleSize: paid.length };
}

/**
 * Server-side heal: for pending rows, re-query Stripe/Paystack; if provider confirms success, finalize (idempotent).
 * Use when webhooks were missed (Group 2 / ops recovery). Does not trust client claims.
 */
async function applyReconciliationFixes(businessId) {
  const applied = [];
  const skipped = [];
  const errors = [];

  const pendingRows = await prisma.paymentHistory.findMany({
    where: { businessId, status: "pending" },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  for (const p of pendingRows) {
    if (p.provider === "PAYSTACK" && paystackSecretKey) {
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.providerRef)}`, {
          headers: { Authorization: `Bearer ${paystackSecretKey}` },
        });
        const body = await res.json().catch(() => ({}));
        if (body?.status === true && body?.data?.status === "success") {
          const txId = body.data?.id;
          const dk = `reconcile-verify-paystack-${txId || p.id}`;
          try {
            const result = await finalizePaidCheckout({
              provider: "PAYSTACK",
              providerRef: p.providerRef,
              dedupeKey: dk,
              paymentHistoryId: p.id,
            });
            if (!result?.skipped && body.data) {
              await persistPaystackAuthorizationFromCharge(body.data, p.id);
            }
            logger.info(
              { event: "reconciliation_applied", paymentId: p.id, provider: "PAYSTACK", skipped: result?.skipped },
              "pending payment finalized from Paystack verify"
            );
            applied.push({ paymentId: p.id, provider: "PAYSTACK", duplicate: Boolean(result?.skipped) });
          } catch (e) {
            errors.push({ paymentId: p.id, provider: "PAYSTACK", error: e.message });
          }
        } else {
          skipped.push({ paymentId: p.id, provider: "PAYSTACK", reason: "provider_not_success" });
        }
      } catch (e) {
        errors.push({ paymentId: p.id, provider: "PAYSTACK", error: e.message });
      }
      continue;
    }

    if (p.provider === "STRIPE" && stripeSecretKey && p.providerMetadata?.stripeCheckoutSessionId) {
      try {
        // eslint-disable-next-line global-require
        const Stripe = require("stripe");
        const stripe = new Stripe(stripeSecretKey);
        const sid = p.providerMetadata.stripeCheckoutSessionId;
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (s.payment_status === "paid" || s.payment_status === "complete") {
          const dk = `reconcile-verify-stripe-${sid}`;
          try {
            const result = await finalizePaidCheckout({
              provider: "STRIPE",
              providerRef: p.providerRef,
              dedupeKey: dk,
              paymentHistoryId: p.id,
            });
            if (!result?.skipped) {
              await persistStripeCredentialsFromCheckoutSession(s);
            }
            logger.info(
              { event: "reconciliation_applied", paymentId: p.id, provider: "STRIPE", skipped: result?.skipped },
              "pending payment finalized from Stripe session retrieve"
            );
            applied.push({ paymentId: p.id, provider: "STRIPE", duplicate: Boolean(result?.skipped) });
          } catch (e) {
            errors.push({ paymentId: p.id, provider: "STRIPE", error: e.message });
          }
        } else {
          skipped.push({ paymentId: p.id, provider: "STRIPE", reason: `session_${s.payment_status}` });
        }
      } catch (e) {
        errors.push({ paymentId: p.id, provider: "STRIPE", error: e.message });
      }
    }
  }

  return { applied, skipped, errors, at: new Date().toISOString() };
}

module.exports = { reconcilePaymentsForBusiness, applyReconciliationFixes };
