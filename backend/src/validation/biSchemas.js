const { z } = require("zod");

function emptyToUndefined(inner) {
  return z.preprocess((v) => (v === "" || v == null ? undefined : v), inner);
}

const isoDateRequired = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const snapshotQuery = z
  .object({
    from: isoDateRequired,
    to: isoDateRequired,
    granularity: z.enum(["day", "week", "month"]).optional(),
    productId: emptyToUndefined(z.string().uuid().optional()),
    storeId: emptyToUndefined(z.string().uuid().optional()),
  })
  .refine((o) => new Date(o.from).getTime() <= new Date(o.to).getTime(), {
    message: "`from` must be before or equal to `to`",
    path: ["to"],
  });

const drilldownQuery = z
  .object({
    from: isoDateRequired,
    to: isoDateRequired,
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    productId: emptyToUndefined(z.string().uuid().optional()),
    storeId: emptyToUndefined(z.string().uuid().optional()),
  })
  .refine((o) => new Date(o.from).getTime() <= new Date(o.to).getTime(), {
    message: "`from` must be before or equal to `to`",
    path: ["to"],
  });

const slackSummaryBody = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const transactionIdParam = z.object({
  id: z.string().min(1).max(200),
});

module.exports = { snapshotQuery, drilldownQuery, slackSummaryBody, transactionIdParam };
