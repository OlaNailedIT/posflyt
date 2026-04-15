const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `obs_${Date.now()}@posflyt.test`;
let adminToken = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup admin for observability routes", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Obs Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  adminToken = register.body.data.token;
});

test("GET /api/v1/obs/summary returns summary envelope", async () => {
  const res = await request(app).get("/api/v1/obs/summary").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(typeof res.body.data.integrityEvents?.total === "number");
});

test("GET /api/v1/obs/health returns health score", async () => {
  const res = await request(app).get("/api/v1/obs/health").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.healthScore >= 0 && res.body.data.healthScore <= 100);
});

test("GET /api/v1/obs/anomalies returns items array", async () => {
  const res = await request(app).get("/api/v1/obs/anomalies").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("GET /api/v1/stream/stats returns bus snapshot", async () => {
  const res = await request(app).get("/api/v1/stream/stats").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.data.bus?.buffered === "number");
});

test("GET /api/v1/stream/recent returns events array", async () => {
  const res = await request(app).get("/api/v1/stream/recent").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.events));
});

test("GET /api/v1/distributed/shard returns shard metadata", async () => {
  const res = await request(app).get("/api/v1/distributed/shard").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.shard?.shardId);
  assert.equal(res.body.status, "ok");
});

test("non-admin cannot access obs routes", async () => {
  const email2 = `cash_obs_${Date.now()}@posflyt.test`;
  const reg2 = await request(app).post("/auth/register").send({
    businessName: "Cashier Biz",
    name: "Cash",
    email: email2,
    password: "secret12",
  });
  assert.equal(reg2.status, 201);
  const userId = reg2.body.data.user.id;
  await prisma.user.update({ where: { id: userId }, data: { role: "CASHIER" } });
  const login = await request(app).post("/auth/login").send({
    email: email2,
    password: "secret12",
  });
  assert.equal(login.status, 200);
  const cashierToken = login.body.data.token;
  const res = await request(app).get("/api/v1/obs/summary").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(res.status, 403);
});
