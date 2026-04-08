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
