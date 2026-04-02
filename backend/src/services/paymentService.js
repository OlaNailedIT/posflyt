const crypto = require("crypto");
const prisma = require("../config/prisma");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { stripeSecretKey, paystackSecretKey, appBaseUrl, stripeWebhookSecret, paystackWebhookSecret } =
  require("../config/env");

const PLAN_PRICING = {
  FREE: 0,
  BASIC: 29,
  PREMIUM: 99,
};

function getPlanCurrency(plan) {
  return plan === "BASIC" || plan === "PREMIUM" ? "USD" : "USD";
}

async function createCheckoutSession({ businessId, plan, provider }) {
  await ensureBusinessSubscription(businessId);
  const amount = PLAN_PRICING[plan];
  if (amount === undefined) {
    const error = new Error("Invalid plan");
    error.statusCode = 400;
    throw error;
  }
  const reference = `sub_${provider}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  await prisma.paymentHistory.create({
    data: {
      businessId,
      provider,
      providerRef: reference,
      plan,
      amount,
      currency: getPlanCurrency(plan),
      status: "PENDING",
    },
  });

  // Minimal modular redirect approach, can be replaced by provider SDK flows.
  const redirectUrl = `${appBaseUrl}/billing/return?payment_ref=${reference}&provider=${provider}&plan=${plan}`;
  if (provider === "STRIPE" && stripeSecretKey) return { redirectUrl, reference };
  if (provider === "PAYSTACK" && paystackSecretKey) return { redirectUrl, reference };
  return { redirectUrl, reference };
}

async function markSubscriptionPaid({ providerRef, provider, businessId, plan }) {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);

  await prisma.$transaction(async (tx) => {
    await tx.paymentHistory.updateMany({
      where: { providerRef, provider },
      data: { status: "PAID", paidAt: now },
    });
    await tx.subscription.upsert({
      where: { businessId },
      update: {
        plan,
        status: "ACTIVE",
        provider,
        externalRef: providerRef,
        expiresAt,
      },
      create: {
        businessId,
        plan,
        status: "ACTIVE",
        provider,
        externalRef: providerRef,
        expiresAt,
      },
    });
  });
}

async function confirmPaymentForBusiness({ businessId, providerRef, provider, plan }) {
  await markSubscriptionPaid({ businessId, providerRef, provider, plan });
  return prisma.subscription.findUnique({ where: { businessId } });
}

function verifyWebhookSignature(provider, bodyString, signatureHeader) {
  if (provider === "STRIPE" && stripeWebhookSecret) {
    const expected = crypto.createHmac("sha256", stripeWebhookSecret).update(bodyString).digest("hex");
    return signatureHeader === expected;
  }
  if (provider === "PAYSTACK" && paystackWebhookSecret) {
    const expected = crypto.createHmac("sha512", paystackWebhookSecret).update(bodyString).digest("hex");
    return signatureHeader === expected;
  }
  return true;
}

async function getPaymentHistory(businessId) {
  return prisma.paymentHistory.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

module.exports = {
  PLAN_PRICING,
  createCheckoutSession,
  markSubscriptionPaid,
  verifyWebhookSignature,
  getPaymentHistory,
  confirmPaymentForBusiness,
};
