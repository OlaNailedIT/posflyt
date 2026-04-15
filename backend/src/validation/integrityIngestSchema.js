const { z } = require("zod");

/** Whitelist aligned with client `INTEGRITY_EVENT` (extend as new types ship). */
const INTEGRITY_EVENT_TYPES = ["SALE_APPLIED", "SALE_QUEUED_OFFLINE"];

const integrityIngestBodySchema = z
  .object({
    eventId: z.string().min(1),
    businessId: z.string().uuid(),
    clientTransactionId: z.string().min(1),
    transactionId: z.string().min(1).optional(),
    type: z.enum(INTEGRITY_EVENT_TYPES),
    payload: z.record(z.string(), z.any()),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.enum(["online", "offline", "sync"]),
    timestamp: z.number(),
    userId: z.string().uuid().optional(),
  })
  .strict();

module.exports = {
  integrityIngestBodySchema,
  INTEGRITY_EVENT_TYPES,
};
