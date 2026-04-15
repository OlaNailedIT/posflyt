const prisma = require("../config/prisma");
const { hashPassword, comparePassword } = require("../utils/password");
const { signAuthToken } = require("../utils/jwt");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { ensureOnboarding } = require("./onboardingService");
const { createSession } = require("./sessionService");
const { issueRefreshToken } = require("./refreshTokenService");
const { logAudit } = require("./auditService");
const { sanitizeDisplayName, normalizeEmail } = require("../utils/sanitize");
const { normalizePhoneDigits } = require("../utils/phone");
const { logger } = require("../utils/logger");

async function registerOwner({ businessName, name, email, password, userAgent, ipAddress }) {
  const safeBusinessName = sanitizeDisplayName(businessName, 120);
  const safeName = sanitizeDisplayName(name, 120);
  const safeEmail = normalizeEmail(email);

  const existing = await prisma.user.findUnique({ where: { email: safeEmail } });
  if (existing) {
    const error = new Error("Email already in use");
    error.statusCode = 409;
    throw error;
  }

  const hashed = await hashPassword(password);

  const result = await prisma.business.create({
    data: {
      name: safeBusinessName,
      users: {
        create: {
          name: safeName,
          email: safeEmail,
          password: hashed,
          role: "ADMIN",
        },
      },
    },
    include: { users: true },
  });

  const user = result.users[0];
  const subscription = await ensureBusinessSubscription(result.id);
  await ensureOnboarding(result.id);
  const jti = await createSession({ userId: user.id, userAgent, ipAddress });
  const token = signAuthToken({
    userId: user.id,
    businessId: result.id,
    role: user.role,
    jti,
  });
  const refreshToken = await issueRefreshToken(user.id, jti);
  await logAudit({
    businessId: result.id,
    userId: user.id,
    action: "AUTH_REGISTER",
    metadata: { email: user.email },
  });

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business_id: user.businessId,
      subscription_plan: subscription.plan,
    },
    business: {
      id: result.id,
      name: result.name,
    },
  };
}

async function login({ email, password, userAgent, ipAddress, requestId }) {
  const safeEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: safeEmail } });
  if (!user) {
    logger.warn(
      {
        event: "AUTH_LOGIN_FAILED",
        reason: "UNKNOWN_EMAIL",
        requestId: requestId || null,
        ip: ipAddress || null,
      },
      "login failed: unknown email"
    );
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    await logAudit({
      businessId: user.businessId,
      userId: user.id,
      action: "AUTH_LOGIN_FAILED_INVALID_PASSWORD",
      metadata: {
        requestId: requestId || null,
        ip: ipAddress || null,
      },
    });
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const subscription = await ensureBusinessSubscription(user.businessId);
  await ensureOnboarding(user.businessId);
  const jti = await createSession({ userId: user.id, userAgent, ipAddress });
  const token = signAuthToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    jti,
  });
  const refreshToken = await issueRefreshToken(user.id, jti);
  await logAudit({
    businessId: user.businessId,
    userId: user.id,
    action: "AUTH_LOGIN",
    metadata: { email: user.email, requestId: requestId || null },
  });

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business_id: user.businessId,
      subscription_plan: subscription.plan,
    },
  };
}

async function staffLogin({ phone, pin, userAgent, ipAddress, requestId }) {
  const normalized = normalizePhoneDigits(phone);
  if (!normalized) {
    const error = new Error("Invalid phone number");
    error.statusCode = 400;
    error.code = "INVALID_PHONE";
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { phone: normalized },
  });
  if (!user) {
    logger.warn(
      {
        event: "AUTH_STAFF_LOGIN_FAILED",
        reason: "UNKNOWN_PHONE",
        requestId: requestId || null,
        ip: ipAddress || null,
      },
      "staff login failed: unknown phone"
    );
    const error = new Error("Invalid phone or PIN");
    error.statusCode = 401;
    throw error;
  }

  const valid = await comparePassword(pin, user.password);
  if (!valid) {
    await logAudit({
      businessId: user.businessId,
      userId: user.id,
      action: "AUTH_LOGIN_FAILED_INVALID_PASSWORD",
      metadata: {
        requestId: requestId || null,
        ip: ipAddress || null,
        method: "phone_pin",
      },
    });
    const error = new Error("Invalid phone or PIN");
    error.statusCode = 401;
    throw error;
  }

  const subscription = await ensureBusinessSubscription(user.businessId);
  await ensureOnboarding(user.businessId);
  const jti = await createSession({ userId: user.id, userAgent, ipAddress });
  const token = signAuthToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    jti,
  });
  const refreshToken = await issueRefreshToken(user.id, jti);
  await logAudit({
    businessId: user.businessId,
    userId: user.id,
    action: "AUTH_LOGIN",
    metadata: { phone: normalized, requestId: requestId || null, method: "phone_pin" },
  });

  /** Lets the device verify PIN offline (bcrypt compare) and encrypt bundle locally — same hash as DB password. */
  const offlineBundle = user.phone
    ? {
        staffId: user.id,
        phone: user.phone,
        role: user.role,
        businessId: user.businessId,
        storeId: null,
        pinHash: user.password,
      }
    : undefined;

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business_id: user.businessId,
      subscription_plan: subscription.plan,
      phone: user.phone,
    },
    offlineBundle,
  };
}

async function getSessionPayload(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      businessId: true,
      phone: true,
      email: true,
    },
  });
  if (!user) return null;
  const subscription = await ensureBusinessSubscription(user.businessId);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business_id: user.businessId,
      subscription_plan: subscription.plan,
      phone: user.phone,
    },
  };
}

module.exports = { registerOwner, login, staffLogin, getSessionPayload };
