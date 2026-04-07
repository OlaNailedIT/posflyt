const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `sync_${Date.now()}@posflyt.test`;
let token = "";
let productId = "";
let txId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account and product", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Sync Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;

  const product = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      id: randomUUID(),
      name: "SYNC SKU",
      price: 150,
      stock: 1,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;
});

test("transaction idempotency + stock integrity", async () => {
  txId = randomUUID();
  const payload = {
    client_transaction_id: txId,
    created_at: new Date().toISOString(),
    payment_method: "CASH",
    items: [{ product_id: productId, quantity: 1 }],
  };

  const first = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.synced, 1);
  assert.equal(first.body.data.duplicates, 0);
  assert.equal(first.body.data.failed, 0);
  assert.equal(first.body.data.syncStatus, "applied");
  assert.equal(first.body.data.clientTransactionId, txId);

  const duplicate = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.body.data.synced, 0);
  assert.equal(duplicate.body.data.duplicates, 1);
  assert.equal(duplicate.body.data.failed, 0);
  assert.equal(duplicate.body.data.syncStatus, "duplicate");

  const list = await request(app).get("/transactions").set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].id, txId);

  const overSell = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(overSell.status, 207);
  assert.equal(overSell.body.data.failed, 1);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  assert.equal(product.stock, 0);
});

test("POST /transactions rejects invalid body with standard error envelope", async () => {
  const bad = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({ items: [{ product_id: productId, quantity: 1 }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.status, "error");
  assert.equal(bad.body.code, "VALIDATION_FAILED");
  assert.ok(typeof bad.body.message === "string");
  assert.ok(bad.body.data && typeof bad.body.data === "object");
  assert.ok(Array.isArray(bad.body.data.details?.errors));
});
