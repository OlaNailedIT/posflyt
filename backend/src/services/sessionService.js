const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

async function createSession({ userId, userAgent, ipAddress }) {
  const tokenJti = randomUUID();
  await prisma.activeSession.create({
    data: {
      tokenJti,
      userId,
      userAgent: userAgent || "",
      ipAddress: ipAddress || "",
    },
  });
  return tokenJti;
}

async function validateSession(tokenJti) {
  const session = await prisma.activeSession.findUnique({ where: { tokenJti } });
  if (!session || session.revokedAt) return null;
  await prisma.activeSession.update({
    where: { tokenJti },
    data: { lastSeenAt: new Date() },
  });
  return session;
}

async function revokeAllUserSessions(userId) {
  return prisma.$transaction([
    prisma.activeSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

module.exports = { createSession, validateSession, revokeAllUserSessions };
