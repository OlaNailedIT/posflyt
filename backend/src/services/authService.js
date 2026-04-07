const prisma = require("../config/prisma");
const { hashPassword, comparePassword } = require("../utils/password");
const { signAuthToken } = require("../utils/jwt");
const { ensureBusinessSubscription } = require("./subscriptionService");
const { ensureOnboarding } = require("./onboardingService");
const { createSession } = require("./sessionService");
const { issueRefreshToken } = require("./refreshTokenService");
const { logAudit } = require("./auditService");

async function registerOwner({ businessName, name, email, password, userAgent, ipAddress }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const error = new Error("Email already in use");
    error.statusCode = 409;
    throw error;
  }

  const hashed = await hashPassword(password);

  const result = await prisma.business.create({
    data: {
      name: businessName,
      users: {
        create: {
          name,
          email,
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

async function login({ email, password, userAgent, ipAddress }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
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
  };
}

module.exports = { registerOwner, login };
