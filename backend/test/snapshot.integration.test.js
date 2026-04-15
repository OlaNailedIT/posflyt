const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const { computePayloadHash } = require("../src/services/integrityIngestService");

const email = `snap_${Date.now()}@posflyt.test`;
let token = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for snapshot tests", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Snap Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;
});

test("financial-state returns snapshot after ingest + async refresh", async () => {
  const clientTx = randomUUID();
  const payload = { total: 55, payment_status: "paid", payment_method: "CASH" };
  const payloadHash = computePayloadHash(payload);

  const ing = await request(app)
    .post("/api/v1/events/ingest")
    .set("Authorization", `Bearer ${token}`)
    .send({
      eventId: `${clientTx}:SALE_APPLIED`,
      businessId,
      clientTransactionId: clientTx,
      type: "SALE_APPLIED",
      payload,
      payloadHash,
      source: "online",
      timestamp: Date.now(),
    });
  assert.equal(ing.status, 200);

  await new Promise((r) => setImmediate(r));

  const fin = await request(app)
    .get(`/api/v1/financial-state/transaction/${encodeURIComponent(clientTx)}`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(fin.status, 200);
  const fs = fin.body.data.financialState;
  assert.ok(fs.source === "snapshot" || fs.source === "snapshot_delta" || fs.source === "replay");
  assert.equal(fs.state.runningNet, 55);
});

test("financial-state empty scope uses empty source", async () => {
  const emptyId = randomUUID();
  const fin = await request(app)
    .get(`/api/v1/financial-state/transaction/${encodeURIComponent(emptyId)}`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(fin.status, 200);
  assert.equal(fin.body.data.financialState.source, "empty");
});
