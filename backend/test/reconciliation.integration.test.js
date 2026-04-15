const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const { computePayloadHash } = require("../src/services/integrityIngestService");

const email = `recon_${Date.now()}@posflyt.test`;
let token = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for reconciliation tests", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Recon Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;
});

test("GET /api/v1/reconciliation/transaction/:id PASS after integrity ingest", async () => {
  const clientTx = randomUUID();
  const eventId = `${clientTx}:SALE_APPLIED`;
  const payload = { totalAmount: 99, total: 99, payment_status: "paid", payment_method: "CASH" };
  const payloadHash = computePayloadHash(payload);

  const ing = await request(app)
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

  assert.equal(ing.status, 200);

  const recon = await request(app)
    .get(`/api/v1/reconciliation/transaction/${encodeURIComponent(clientTx)}`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(recon.status, 200);
  assert.equal(recon.body.status, "ok");
  const r = recon.body.data.reconciliation;
  assert.equal(r.status, "PASS");
  assert.equal(r.summary.eventCount, 1);
  assert.equal(r.summary.ledgerLineCountExpected, 1);
  assert.equal(r.summary.ledgerLineCountStored, 1);
  assert.ok(r.fingerprint.eventsHash);
  assert.ok(r.fingerprint.ledgerExpectedHash);
  assert.equal(r.fingerprint.ledgerExpectedHash, r.fingerprint.ledgerStoredHash);
});

test("GET reconciliation empty scope returns PASS", async () => {
  const emptyId = randomUUID();
  const recon = await request(app)
    .get(`/api/v1/reconciliation/transaction/${encodeURIComponent(emptyId)}`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(recon.status, 200);
  const r = recon.body.data.reconciliation;
  assert.equal(r.status, "PASS");
  assert.equal(r.summary.eventCount, 0);
  assert.equal(r.mismatches.length, 0);
});
