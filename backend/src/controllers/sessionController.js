const { revokeAllUserSessions } = require("../services/sessionService");
const { logAudit } = require("../services/auditService");
const prisma = require("../config/prisma");
const { sendOk } = require("../utils/http");

async function logoutAllDevices(req, res, next) {
  try {
    await revokeAllUserSessions(req.auth.userId);
    await logAudit({
      businessId: req.auth.businessId,
      userId: req.auth.userId,
      action: "AUTH_LOGOUT_ALL",
      metadata: {},
    });
    return sendOk(res, { message: "Logged out from all devices" });
  } catch (error) {
    return next(error);
  }
}

async function listActiveSessions(req, res, next) {
  try {
    const sessions = await prisma.activeSession.findMany({
      where: { userId: req.auth.userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
    return sendOk(res, sessions);
  } catch (error) {
    return next(error);
  }
}

module.exports = { logoutAllDevices, listActiveSessions };
