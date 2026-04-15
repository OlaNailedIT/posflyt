const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const { computePayloadHash } = require("../src/services/integrityIngestService");

const email = `integrity_${Date.now()}@posflyt.test`;
let token = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for integrity ingest tests", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Integrity Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;
});

test("POST /api/v1/events/ingest accepts SALE_APPLIED (idempotent hash, projection)", async () => {
  const clientTx = randomUUID();
  const eventId = `${clientTx}:SALE_APPLIED`;
  const payload = { totalAmount: 42.5, total: 42.5 };
  const payloadHash = computePayloadHash(payload);

  const first = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId,
      businessId,
      clientTransactionId: clientTx,
      type: "SALE_APPLIED",
      payload,
      payloadHash,
      source: "online",
      timestamp: Date.now(),
    });

  assert.equal(first.status, 200);
  assert.equal(first.body.status, "ok");
  assert.equal(first.body.data.ingestStatus, "accepted");
  assert.equal(first.body.data.eventId, eventId);
  assert.equal(first.body.data.existing, false);
  assert.equal(first.body.data.ledgerProjected, true);

  const line = await prisma.integrityLedgerLine.findFirst({ where: { sourceEventId: eventId } });
  assert.ok(line);
  assert.equal(line.credit, 42.5);

  const dup = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId,
      businessId,
      clientTransactionId: clientTx,
      type: "SALE_APPLIED",
      payload,
      payloadHash,
      source: "sync",
      timestamp: Date.now(),
    });

  assert.equal(dup.status, 200);
  assert.equal(dup.body.data.ingestStatus, "duplicate");
  assert.equal(dup.body.data.existing, true);
});

test("POST /api/v1/events/ingest rejects hash mismatch", async () => {
  const clientTx = randomUUID();
  const eventId = `${clientTx}:SALE_BAD_HASH`;
  const payload = { total: 1 };
  const badHash = "a".repeat(64);

  const res = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId,
      businessId,
      clientTransactionId: clientTx,
      type: "SALE_APPLIED",
      payload,
      payloadHash: badHash,
      source: "offline",
      timestamp: Date.now(),
    });

  assert.equal(res.status, 409);
  assert.equal(res.body.code, "IDEMPOTENCY_HASH_MISMATCH");
});

test("POST /api/v1/events/ingest rejects wrong businessId", async () => {
  const res = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId: randomUUID(),
      businessId: randomUUID(),
      clientTransactionId: randomUUID(),
      type: "SALE_QUEUED_OFFLINE",
      payload: {},
      payloadHash: computePayloadHash({}),
      source: "online",
      timestamp: Date.now(),
    });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "BUSINESS_SCOPE_MISMATCH");
});

test("SALE_QUEUED_OFFLINE creates event without ledger line", async () => {
  const clientTx = randomUUID();
  const eventId = `${clientTx}:SALE_QUEUED_OFFLINE`;
  const payload = {};
  const payloadHash = computePayloadHash(payload);

  const res = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId,
      businessId,
      clientTransactionId: clientTx,
      type: "SALE_QUEUED_OFFLINE",
      payload,
      payloadHash,
      source: "offline",
      timestamp: Date.now(),
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.ingestStatus, "accepted");
  assert.equal(res.body.data.ledgerProjected, true);

  const lines = await prisma.integrityLedgerLine.count({ where: { sourceEventId: eventId } });
  assert.equal(lines, 0);
});
