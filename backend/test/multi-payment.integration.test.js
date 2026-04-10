const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `multi_pay_${Date.now()}@posflyt.test`;
let token = "";
let productId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account and product for multi-payment", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Multi Pay Biz",
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
      name: "Multi SKU",
      price: 100,
      stock: 5,
      lowStockThreshold: 1,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;
});

test("split payments sum to total and persist MULTI + payments JSON", async () => {
  const txId = randomUUID();
  const res = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: txId,
      created_at: new Date().toISOString(),
      payment_status: "paid",
      payments: [
        { type: "CASH", amount: 40 },
        { type: "TRANSFER", amount: 60 },
      ],
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.synced, 1);

  const row = await prisma.transaction.findUnique({ where: { id: txId } });
  assert.equal(row.paymentMethod, "MULTI");
  assert.ok(Array.isArray(row.payments));
  assert.equal(row.payments.length, 2);
  assert.equal(row.totalAmount, 100);
  assert.equal(row.amountPaid, 100);
});

test("GET /transactions returns payments array", async () => {
  const list = await request(app).get("/transactions").set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const multi = list.body.data.find((t) => t.paymentMethod === "MULTI");
  assert.ok(multi);
  assert.ok(Array.isArray(multi.payments));
});
