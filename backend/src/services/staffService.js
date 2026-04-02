const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { hashPassword } = require("../utils/password");
const { logAudit } = require("./auditService");
const { revokeAllUserSessions } = require("./sessionService");

async function getStaffDisabledMap(businessId) {
  const logs = await prisma.auditLog.findMany({
    where: {
      businessId,
      action: { in: ["STAFF_DISABLED", "STAFF_REACTIVATED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, metadata: true },
  });
  const disabledMap = new Map();
  for (const log of logs) {
    const staffUserId = log?.metadata?.staffUserId;
    if (!staffUserId || disabledMap.has(staffUserId)) continue;
    disabledMap.set(staffUserId, log.action === "STAFF_DISABLED");
  }
  return disabledMap;
}

async function listStaff(businessId) {
  const [users, disabledMap, activeSessions] = await Promise.all([
    prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    getStaffDisabledMap(businessId),
    prisma.activeSession.findMany({
      where: {
        user: { businessId },
        revokedAt: null,
      },
      select: { userId: true, lastSeenAt: true },
    }),
  ]);
  const lastSeenByUserId = activeSessions.reduce((acc, session) => {
    const ts = new Date(session.lastSeenAt).toISOString();
    if (!acc[session.userId] || new Date(acc[session.userId]).getTime() < new Date(ts).getTime()) {
      acc[session.userId] = ts;
    }
    return acc;
  }, {});
  return users.map((user) => ({
    ...user,
    isDisabled: Boolean(disabledMap.get(user.id)),
    lastActivityAt: lastSeenByUserId[user.id] || null,
  }));
}

async function disableStaff(businessId, staffUserId, actingUserId) {
  const user = await prisma.user.findFirst({
    where: { businessId, id: staffUserId },
    select: { id: true, role: true },
  });
  if (!user) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    error.code = "STAFF_NOT_FOUND";
    error.location = "services/staffService.disableStaff";
    throw error;
  }
  if (user.role === "ADMIN") {
    const error = new Error("Cannot disable admin account");
    error.statusCode = 400;
    error.code = "INVALID_STAFF_OPERATION";
    error.location = "services/staffService.disableStaff";
    throw error;
  }

  await prisma.user.update({
    where: { id: staffUserId },
    data: { password: await hashPassword(`disabled-${randomUUID()}`) },
  });
  await revokeAllUserSessions(staffUserId);
  await logAudit({
    businessId,
    userId: actingUserId,
    action: "STAFF_DISABLED",
    metadata: { staffUserId },
  });

  return { staffUserId, status: "disabled" };
}

async function reactivateStaff(businessId, staffUserId, payload, actingUserId) {
  const user = await prisma.user.findFirst({
    where: { businessId, id: staffUserId },
    select: { id: true, role: true },
  });
  if (!user) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    error.code = "STAFF_NOT_FOUND";
    error.location = "services/staffService.reactivateStaff";
    throw error;
  }
  if (user.role === "ADMIN") {
    const error = new Error("Cannot reactivate admin account");
    error.statusCode = 400;
    error.code = "INVALID_STAFF_OPERATION";
    error.location = "services/staffService.reactivateStaff";
    throw error;
  }
  await prisma.user.update({
    where: { id: staffUserId },
    data: { password: await hashPassword(payload.password) },
  });
  await logAudit({
    businessId,
    userId: actingUserId,
    action: "STAFF_REACTIVATED",
    metadata: { staffUserId },
  });
  return { staffUserId, status: "active" };
}

async function createStaff(businessId, payload, createdByUserId) {
  const existing = await prisma.user.findUnique({ where: { email: payload.email } });
  if (existing) {
    const error = new Error("Email already in use");
    error.statusCode = 409;
    error.code = "EMAIL_ALREADY_IN_USE";
    error.location = "services/staffService.createStaff";
    throw error;
  }

  const password = await hashPassword(payload.password);
  const user = await prisma.user.create({
    data: {
      businessId,
      name: payload.name,
      email: payload.email,
      password,
      role: payload.role,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  await logAudit({
    businessId,
    userId: createdByUserId,
    action: "STAFF_CREATED",
    metadata: {
      staffUserId: user.id,
      role: user.role,
      email: user.email,
    },
  });

  return user;
}

module.exports = { listStaff, createStaff, disableStaff, reactivateStaff };
