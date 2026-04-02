const prisma = require("../config/prisma");

async function logAudit({ businessId, userId, action, metadata }) {
  if (!businessId || !action) return null;
  return prisma.auditLog.create({
    data: {
      businessId,
      userId: userId || null,
      action,
      metadata: metadata || {},
    },
  });
}

async function listAuditLogs(businessId) {
  return prisma.auditLog.findMany({
    where: { businessId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

module.exports = { logAudit, listAuditLogs };
