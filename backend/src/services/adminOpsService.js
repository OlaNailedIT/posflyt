const prisma = require("../config/prisma");

const TX_SORT_FIELDS = new Set(["createdAt", "total", "syncStatus"]);
const ORDER = new Set(["asc", "desc"]);

/** Mask email for list responses (PII hygiene). */
function maskEmail(email) {
  if (!email || typeof email !== "string") return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const safe = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${safe}@${domain}`;
}

const DEFAULT_EVENT_ACTIONS = [
  "SYNC_DUPLICATE_TRANSACTION",
  "SYNC_INVENTORY_CONFLICT",
  "SYNC_RETRY_FAILED",
  "SYNC_RETRY_RESOLVED",
  "INVENTORY_MISMATCH_WARNING",
  "INVENTORY_MISMATCH_CRITICAL",
  "BILLING_PAYMENT_SUCCEEDED",
];

function parseActionsParam(actionsParam) {
  if (!actionsParam || !String(actionsParam).trim()) return DEFAULT_EVENT_ACTIONS;
  const raw = String(actionsParam)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_EVENT_ACTIONS, "AUTH_REGISTER", "AUTH_LOGIN", "DAILY_CLOSE_CONFIRMED"]);
  return raw.filter((a) => allowed.has(a));
}

async function listTransactionsPaginated(businessId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const sortBy = TX_SORT_FIELDS.has(query.sortBy) ? query.sortBy : "createdAt";
  const order = ORDER.has(query.order) ? query.order : "desc";

  const where = { businessId };
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.userId && /^[0-9a-f-]{36}$/i.test(query.userId)) {
    where.userId = query.userId;
  }
  if (query.syncStatus && ["PENDING", "SYNCED", "FAILED"].includes(query.syncStatus)) {
    where.syncStatus = query.syncStatus;
  }
  if (query.q && String(query.q).trim()) {
    const q = String(query.q).trim();
    where.AND = [
      ...(where.AND || []),
      {
        OR: [{ id: { contains: q } }, { userId: { contains: q } }],
      },
    ];
  }

  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: order },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const sanitized = rows.map((r) => ({
    id: r.id,
    total: r.total,
    paymentMethod: r.paymentMethod,
    createdAt: r.createdAt,
    syncedAt: r.syncedAt,
    syncStatus: r.syncStatus,
    userId: r.userId,
    user: r.user
      ? { id: r.user.id, name: r.user.name, emailMasked: maskEmail(r.user.email) }
      : null,
  }));

  return { rows: sanitized, total, page, pageSize, sortBy, order };
}

async function getTransactionDetail(businessId, transactionId) {
  const row = await prisma.transaction.findFirst({
    where: { id: transactionId, businessId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
  });
  if (!row) return null;
  return {
    ...row,
    user: row.user
      ? { ...row.user, emailMasked: maskEmail(row.user.email), email: undefined }
      : null,
  };
}

async function listAuditEventsPaginated(businessId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const sortBy = query.sortBy === "action" ? "action" : "createdAt";
  const order = ORDER.has(query.order) ? query.order : "desc";

  const actions = parseActionsParam(query.actions);
  const where = {
    businessId,
    action: { in: actions },
  };
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.userId && /^[0-9a-f-]{36}$/i.test(query.userId)) {
    where.userId = query.userId;
  }
  if (query.q && String(query.q).trim()) {
    const q = String(query.q).trim();
    where.AND = [
      ...(where.AND || []),
      {
        OR: [{ action: { contains: q, mode: "insensitive" } }, { id: { contains: q } }],
      },
    ];
  }

  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: order },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const sanitized = rows.map((r) => ({
    id: r.id,
    action: r.action,
    metadata: r.metadata,
    createdAt: r.createdAt,
    userId: r.userId,
    user: r.user
      ? { id: r.user.id, name: r.user.name, emailMasked: maskEmail(r.user.email) }
      : null,
  }));

  return { rows: sanitized, total, page, pageSize, sortBy, order };
}

async function getAuditEventDetail(businessId, eventId) {
  const row = await prisma.auditLog.findFirst({
    where: { id: eventId, businessId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!row) return null;
  return {
    ...row,
    user: row.user
      ? { ...row.user, emailMasked: maskEmail(row.user.email), email: undefined }
      : null,
  };
}

async function listPaymentsPaginated(businessId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const where = { businessId };
  const andParts = [];
  if (query.retryOnly === "true" || query.retryOnly === true) {
    andParts.push({ OR: [{ retryCount: { gt: 0 } }, { nextRetryAt: { not: null } }] });
  }
  if (query.status && String(query.status).trim()) {
    where.status = String(query.status).trim();
  }
  if (query.q && String(query.q).trim()) {
    const term = String(query.q).trim();
    andParts.push({
      OR: [
        { providerRef: { contains: term, mode: "insensitive" } },
        { clientRequestId: { contains: term, mode: "insensitive" } },
        { gatewayEventId: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (andParts.length) {
    where.AND = andParts;
  }
  const skip = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    prisma.paymentHistory.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.paymentHistory.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

async function listWebhookEventsPaginated(businessId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const skip = (page - 1) * pageSize;
  const where = { businessId };
  if (query.outcome && String(query.outcome).trim()) {
    where.outcome = String(query.outcome).trim();
  }
  if (query.q && String(query.q).trim()) {
    const term = String(query.q).trim();
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { dedupeKey: { contains: term, mode: "insensitive" } },
          { provider: { contains: term, mode: "insensitive" } },
        ],
      },
    ];
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  const [rows, total] = await Promise.all([
    prisma.billingWebhookEvent.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingWebhookEvent.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

async function getSyncSummary(businessId) {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const [
    pending,
    synced,
    failed,
    duplicateConflicts24h,
    inventoryConflicts24h,
    syncRetryFailed24h,
    retryResolved24h,
  ] = await Promise.all([
    prisma.transaction.count({ where: { businessId, syncStatus: "PENDING" } }),
    prisma.transaction.count({ where: { businessId, syncStatus: "SYNCED" } }),
    prisma.transaction.count({ where: { businessId, syncStatus: "FAILED" } }),
    prisma.auditLog.count({
      where: { businessId, action: "SYNC_DUPLICATE_TRANSACTION", createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: { businessId, action: "SYNC_INVENTORY_CONFLICT", createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: { businessId, action: "SYNC_RETRY_FAILED", createdAt: { gte: since } },
    }),
    prisma.auditLog.count({
      where: { businessId, action: "SYNC_RETRY_RESOLVED", createdAt: { gte: since } },
    }),
  ]);

  return {
    transactionsBySyncStatus: { PENDING: pending, SYNCED: synced, FAILED: failed },
    last24h: {
      duplicateConflicts: duplicateConflicts24h,
      inventoryConflicts: inventoryConflicts24h,
      syncRetryFailed: syncRetryFailed24h,
      syncRetryResolved: retryResolved24h,
    },
  };
}

async function listOperationalErrors(businessId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const take = 200;
  const [payments, webhooks] = await Promise.all([
    prisma.paymentHistory.findMany({
      where: { businessId, status: { in: ["failed"] } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.billingWebhookEvent.findMany({
      where: { businessId, outcome: "ERROR" },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);
  const merged = [
    ...payments.map((p) => ({
      kind: "payment",
      id: p.id,
      createdAt: p.createdAt,
      source: "billing",
      status: p.status,
      requestId: p.clientRequestId || null,
      summary: p.failureReason || p.providerRef,
      metadata: {
        provider: p.provider,
        providerRef: p.providerRef,
        retryCount: p.retryCount,
        nextRetryAt: p.nextRetryAt,
      },
    })),
    ...webhooks.map((w) => ({
      kind: "webhook",
      id: w.id,
      createdAt: w.createdAt,
      source: "billing",
      status: w.outcome || "ERROR",
      requestId: null,
      summary: w.dedupeKey,
      metadata: w.metadata,
    })),
  ]
    .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  const total = merged.length;
  const rows = merged.slice((page - 1) * pageSize, page * pageSize);
  return { rows, total, page, pageSize };
}

async function listMonitoringAlerts(businessId) {
  return prisma.smartAlert.findMany({
    where: { businessId },
    orderBy: { alertDate: "desc" },
    take: 50,
  });
}

module.exports = {
  listTransactionsPaginated,
  getTransactionDetail,
  listAuditEventsPaginated,
  getAuditEventDetail,
  listPaymentsPaginated,
  listWebhookEventsPaginated,
  getSyncSummary,
  listOperationalErrors,
  listMonitoringAlerts,
  maskEmail,
};
