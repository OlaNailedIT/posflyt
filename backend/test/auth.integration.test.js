const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `it_${Date.now()}@posflyt.test`;

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("POST /auth/register creates business and user", async () => {
  const res = await request(app).post("/auth/register").send({
    businessName: "Integration Biz",
    name: "Test Owner",
    email,
    password: "secret12",
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.data.token);
  assert.ok(res.body.data.refreshToken);
  assert.equal(res.body.data.user.email, email);
});

test("POST /auth/login returns token", async () => {
  const res = await request(app).post("/auth/login").send({
    email,
    password: "secret12",
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
  assert.ok(res.body.data.refreshToken);
});

test("POST /auth/refresh returns new token pair", async () => {
  const login = await request(app).post("/auth/login").send({
    email,
    password: "secret12",
  });
  assert.equal(login.status, 200);
  const rt = login.body.data.refreshToken;
  const refreshed = await request(app).post("/auth/refresh").send({ refreshToken: rt });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.token);
  assert.ok(refreshed.body.data.refreshToken);
  assert.notEqual(refreshed.body.data.refreshToken, rt);

  const products = await request(app)
    .get("/products")
    .set("Authorization", `Bearer ${refreshed.body.data.token}`);
  assert.equal(products.status, 200);
});

test("POST /auth/refresh works with HttpOnly refresh cookie (agent)", async () => {
  const agent = request.agent(app);
  const login = await agent.post("/auth/login").send({
    email,
    password: "secret12",
  });
  assert.equal(login.status, 200);
  const refreshed = await agent.post("/auth/refresh").send({});
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.token);
  const products = await agent
    .get("/products")
    .set("Authorization", `Bearer ${refreshed.body.data.token}`);
  assert.equal(products.status, 200);
});

test("POST /auth/refresh rejects invalid token", async () => {
  const res = await request(app).post("/auth/refresh").send({ refreshToken: "invalid-token-xxxxxxxx" });
  assert.equal(res.status, 401);
});

test("GET /products requires auth", async () => {
  const res = await request(app).get("/products");
  assert.equal(res.status, 401);
});

test("product and transaction flow", async () => {
  const login = await request(app).post("/auth/login").send({
    email,
    password: "secret12",
  });
  assert.equal(login.status, 200);
  const token = login.body.data.token;

  const productRes = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Test SKU",
      price: 10,
      stock: 5,
    });
  assert.equal(productRes.status, 201);
  const productId = productRes.body.data.id;

  const clientTxId = randomUUID();
  const txRes = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: clientTxId,
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(txRes.status, 201);

  const dup = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: clientTxId,
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(dup.status, 201);
  assert.ok(dup.body.data.duplicates >= 1);
});
