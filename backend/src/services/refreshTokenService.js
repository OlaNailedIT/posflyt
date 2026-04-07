const crypto = require("crypto");
const prisma = require("../config/prisma");
const { jwtRefreshTtlMs } = require("../config/env");
const { signAuthToken } = require("../utils/jwt");
const { createSession } = require("./sessionService");
const { ensureBusinessSubscription } = require("./subscriptionService");

const REFRESH_TTL_MS = jwtRefreshTtlMs;

function hashRefreshToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function generateOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

/**
 * Persist a hashed refresh token linked to the access-token session (jti).
 * Returns the raw token once — store only the hash server-side.
 */
async function issueRefreshToken(userId, sessionJti) {
  const raw = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      sessionJti: sessionJti || null,
    },
  });
  return raw;
}

/**
 * Validates refresh token, revokes it and its linked access session, issues new access + refresh (rotation).
 */
async function rotateRefreshSession({ rawRefreshToken, userAgent, ipAddress }) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    const err = new Error("Unauthorized: Invalid or expired refresh token");
    err.statusCode = 401;
    throw err;
  }

  const user = row.user;

  await prisma.$transaction(async (tx) => {
    if (row.sessionJti) {
      await tx.activeSession.updateMany({
        where: { tokenJti: row.sessionJti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
  });

  const jti = await createSession({ userId: user.id, userAgent, ipAddress });
  const subscription = await ensureBusinessSubscription(user.businessId);
  const token = signAuthToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
    jti,
  });
  const refreshToken = await issueRefreshToken(user.id, jti);

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

/**
 * Revoke a refresh token and its linked access session (logout / cookie invalidation).
 */
async function revokeRefreshByRaw(rawRefreshToken) {
  if (!rawRefreshToken || typeof rawRefreshToken !== "string") return;
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });
  if (!row || row.revokedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    if (row.sessionJti) {
      await tx.activeSession.updateMany({
        where: { tokenJti: row.sessionJti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });
}

module.exports = {
  issueRefreshToken,
  rotateRefreshSession,
  revokeRefreshByRaw,
};
