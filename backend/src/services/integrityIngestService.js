const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { AppError } = require("../utils/AppError");
const { stableStringify } = require("../utils/stableStringify");
const { projectIntegrityLedgerLinesSafe } = require("./integrityLedgerProjectionService");
const { scheduleSnapshotRefresh } = require("../snapshot/snapshotRefresh");
const { publishIngestOutcome, publishLedgerProjection } = require("../streaming/publish");
const { regionForBusiness } = require("../sharding/shardResolver");
const { deploymentRegionId, strictRegionIngest } = require("../config/env");
const { isRegionWritable } = require("../distributed/failoverGuard");

function computePayloadHash(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

function safeHexEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== 64 || b.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

const SOURCE_TO_PRISMA = {
  online: "ONLINE",
  offline: "OFFLINE",
  sync: "SYNC",
};

async function ledgerProjectedForEvent(eventId, eventType) {
  if (eventType === "SALE_QUEUED_OFFLINE") {
    return true;
  }
  const n = await prisma.integrityLedgerLine.count({ where: { sourceEventId: eventId } });
  return n > 0;
}

/**
 * @param {{ auth: { userId: string, businessId: string }, body: Record<string, unknown> }} args
 */
async function ingestIntegrityEvent({ auth, body }) {
  if (body.businessId !== auth.businessId) {
    throw new AppError("BUSINESS_SCOPE_MISMATCH", "businessId must match authenticated tenant", 403);
  }
  if (body.userId != null && body.userId !== auth.userId) {
    throw new AppError("USER_SCOPE_MISMATCH", "userId must match authenticated user", 403);
  }

  const homeRegion = regionForBusiness(auth.businessId);
  if (strictRegionIngest) {
    if (homeRegion !== deploymentRegionId) {
      throw new AppError(
        "REGION_INGEST_REJECTED",
        "This deployment is not the authoritative region for this tenant",
        409
      );
    }
  }
  if (!isRegionWritable(homeRegion)) {
    throw new AppError(
      "REGION_UNAVAILABLE",
      "Authoritative region is not accepting writes (failover or read-only)",
      503
    );
  }

  const computedHash = computePayloadHash(body.payload);
  if (!safeHexEquals(computedHash, body.payloadHash)) {
    throw new AppError("IDEMPOTENCY_HASH_MISMATCH", "Payload integrity check failed", 409);
  }

  const existing = await prisma.integrityLedgerEvent.findUnique({
    where: { eventId: body.eventId },
  });

  if (existing) {
    if (!safeHexEquals(existing.payloadHash, body.payloadHash)) {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "eventId already recorded with a different payload",
        409
      );
    }
    const projected = await ledgerProjectedForEvent(existing.eventId, existing.type);
    publishIngestOutcome({
      duplicate: true,
      businessId: auth.businessId,
      clientTransactionId: body.clientTransactionId,
      eventId: existing.eventId,
      integrityType: existing.type,
    });
    return {
      ingestStatus: "duplicate",
      eventId: existing.eventId,
      existing: true,
      ledgerProjected: projected,
    };
  }

  if (body.transactionId) {
    const tx = await prisma.transaction.findFirst({
      where: { id: body.transactionId, businessId: auth.businessId },
    });
    if (!tx) {
      throw new AppError(
        "TRANSACTION_NOT_FOUND",
        "transactionId does not exist for this business",
        400
      );
    }
    if (tx.id !== body.clientTransactionId) {
      throw new AppError(
        "TRANSACTION_CONTEXT_MISMATCH",
        "clientTransactionId must match the transaction id when transactionId is set",
        400
      );
    }
  }

  let created;
  try {
    created = await prisma.integrityLedgerEvent.create({
      data: {
        eventId: body.eventId,
        businessId: auth.businessId,
        clientTransactionId: body.clientTransactionId,
        transactionId: body.transactionId ?? null,
        type: body.type,
        payload: body.payload,
        payloadHash: body.payloadHash,
        source: SOURCE_TO_PRISMA[body.source],
        userId: auth.userId,
        clientTimestampMs: BigInt(Math.trunc(Number(body.timestamp))),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.integrityLedgerEvent.findUnique({
        where: { eventId: body.eventId },
      });
      if (raced && !safeHexEquals(raced.payloadHash, body.payloadHash)) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "eventId already recorded with a different payload",
          409
        );
      }
      if (raced) {
        const projected = await ledgerProjectedForEvent(raced.eventId, raced.type);
        publishIngestOutcome({
          duplicate: true,
          businessId: auth.businessId,
          clientTransactionId: body.clientTransactionId,
          eventId: raced.eventId,
          integrityType: raced.type,
        });
        return {
          ingestStatus: "duplicate",
          eventId: raced.eventId,
          existing: true,
          ledgerProjected: projected,
        };
      }
    }
    throw err;
  }

  const projectedOk = await projectIntegrityLedgerLinesSafe(created);
  publishIngestOutcome({
    duplicate: false,
    businessId: auth.businessId,
    clientTransactionId: body.clientTransactionId,
    eventId: created.eventId,
    integrityType: created.type,
  });
  publishLedgerProjection({
    businessId: auth.businessId,
    clientTransactionId: body.clientTransactionId,
    eventId: created.eventId,
    projectedOk,
  });
  scheduleSnapshotRefresh(auth.businessId, body.clientTransactionId);
  return {
    ingestStatus: "accepted",
    eventId: created.eventId,
    existing: false,
    ledgerProjected: projectedOk,
  };
}

module.exports = {
  ingestIntegrityEvent,
  computePayloadHash,
  safeHexEquals,
};
