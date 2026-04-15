const { z } = require("zod");

function emptyToUndefined(inner) {
  return z.preprocess((v) => (v === "" || v == null ? undefined : v), inner);
}

const paginationQuery = z.object({
  page: emptyToUndefined(z.coerce.number().int().min(1).optional()),
  pageSize: emptyToUndefined(z.coerce.number().int().min(1).max(100).optional()),
});

const isoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
    .optional()
);

const transactionsListQuery = paginationQuery.extend({
    sortBy: emptyToUndefined(z.enum(["createdAt", "totalAmount", "syncStatus"]).optional()),
  order: emptyToUndefined(z.enum(["asc", "desc"]).optional()),
  userId: emptyToUndefined(z.string().uuid().optional()),
  syncStatus: emptyToUndefined(z.enum(["PENDING", "SYNCED", "FAILED"]).optional()),
  from: isoDate,
  to: isoDate,
  q: emptyToUndefined(z.string().max(200).optional()),
});

const eventsListQuery = paginationQuery.extend({
  sortBy: emptyToUndefined(z.enum(["createdAt", "action"]).optional()),
  order: emptyToUndefined(z.enum(["asc", "desc"]).optional()),
  userId: emptyToUndefined(z.string().uuid().optional()),
  from: isoDate,
  to: isoDate,
  q: emptyToUndefined(z.string().max(200).optional()),
  actions: emptyToUndefined(z.string().max(2000).optional()),
});

const paymentsListQuery = paginationQuery.extend({
  status: emptyToUndefined(z.string().max(64).optional()),
  retryOnly: emptyToUndefined(z.enum(["true", "false"]).optional()),
  from: isoDate,
  to: isoDate,
  q: emptyToUndefined(z.string().max(200).optional()),
});

const webhookEventsListQuery = paginationQuery.extend({
  outcome: emptyToUndefined(z.string().max(32).optional()),
  from: isoDate,
  to: isoDate,
  q: emptyToUndefined(z.string().max(200).optional()),
});

const errorsListQuery = paginationQuery;

const uuidParam = z.object({
  id: z.string().uuid(),
});

const transactionIdParam = z.object({
  id: z.string().min(1).max(200),
});

const alertTestBody = z.object({
  message: z.string().max(500).optional(),
});

module.exports = {
  transactionsListQuery,
  eventsListQuery,
  paymentsListQuery,
  webhookEventsListQuery,
  errorsListQuery,
  uuidParam,
  transactionIdParam,
  alertTestBody,
};
