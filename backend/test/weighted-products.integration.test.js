const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `weighted_${Date.now()}@posflyt.test`;
let token = "";
let productKgId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account and kg product", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Weighted Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;

  productKgId = randomUUID();
  const product = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      id: productKgId,
      name: "Rice",
      unitType: "kg",
      price: 400,
      pricePerUnit: 400,
      sellingPrice: 400,
      stock: 100,
      lowStockThreshold: 5,
    });
  assert.equal(product.status, 201);
  assert.equal(product.body.data.unitType, "kg");
});

test("sale by weight: line total and stock decrement", async () => {
  const txId = randomUUID();
  const res = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: txId,
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productKgId, quantity: 2.5 }],
    });
  assert.equal(res.status, 201);
  const row = await prisma.transaction.findUnique({
    where: { id: txId },
    include: { items: true },
  });
  assert.equal(row.totalAmount, 1000);
  const line = row.items[0];
  assert.equal(line.quantity, 2.5);
  assert.equal(line.price, 400);

  const p = await prisma.product.findUnique({ where: { id: productKgId } });
  assert.equal(p.stock, 97.5);
});

test("discrete quantity must be whole", async () => {
  const pid = randomUUID();
  await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      id: pid,
      name: "Apple",
      price: 50,
      stock: 20,
      lowStockThreshold: 2,
    });

  const bad = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: pid, quantity: 1.5 }],
    });
  assert.equal(bad.status, 207);
  assert.equal(bad.body.data.failed, 1);
  const failed = bad.body.data.results.find((r) => r.status === "failed");
  assert.equal(failed?.code, "INVALID_ITEM_QUANTITY");
});
