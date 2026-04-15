const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

test("GET /health returns ok", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(typeof res.body.requestId === "string" && res.body.requestId.length > 0);
  assert.equal(res.body.data.service, "posflyt-backend");
  assert.equal(res.body.data.status, "ok");
  assert.ok(typeof res.body.data.uptimeSeconds === "number" && res.body.data.uptimeSeconds >= 0);
});

test("GET /api/health matches GET /health (API prefix alias)", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.data.service, "posflyt-backend");
});

test("POST /audit-events/bulk and /api/audit-events/bulk are routed (401 without auth, not 404)", async () => {
  const root = await request(app).post("/audit-events/bulk").send({ events: [] });
  const prefixed = await request(app).post("/api/audit-events/bulk").send({ events: [] });
  assert.notEqual(root.status, 404);
  assert.notEqual(prefixed.status, 404);
  assert.equal(root.status, 401);
  assert.equal(prefixed.status, 401);
});
