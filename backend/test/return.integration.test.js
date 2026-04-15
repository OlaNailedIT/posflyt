const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `return_${Date.now()}@posflyt.test`;
let token = "";
let productId = "";
let saleId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup sale for returns", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Return Test Biz",
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
      name: "Return SKU",
      price: 50,
      stock: 10,
      lowStockThreshold: 1,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;

  saleId = randomUUID();
  const sale = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: saleId,
      created_at: new Date().toISOString(),
      payment_status: "paid",
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 2 }],
    });
  assert.equal(sale.status, 201);
});

test("return is idempotent on client_return_id", async () => {
  const clientReturnId = randomUUID();
  const first = await request(app)
    .post("/transactions/return")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_return_id: clientReturnId,
      original_transaction_id: saleId,
    });
  assert.equal(first.status, 200);
  assert.ok(first.body.data.transaction);
  assert.equal(first.body.data.transaction.transactionType, "RETURN");

  const dup = await request(app)
    .post("/transactions/return")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_return_id: clientReturnId,
      original_transaction_id: saleId,
    });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.data.duplicate, true);

  const saleRow = await prisma.transaction.findUnique({ where: { id: saleId } });
  const sr = await prisma.saleReturn.findUnique({
    where: {
      businessId_clientReturnId: {
        businessId: saleRow.businessId,
        clientReturnId,
      },
    },
  });
  assert.ok(sr);
  assert.equal(sr.state, "RETURN_COMPLETED");

  const ledger = await prisma.financialLedgerEntry.findUnique({
    where: { saleReturnId: sr.id },
  });
  assert.ok(ledger);
  assert.equal(ledger.kind, "RETURN_REVERSAL");
});

test("second return on same sale rejected when fully returned", async () => {
  const res = await request(app)
    .post("/transactions/return")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_return_id: randomUUID(),
      original_transaction_id: saleId,
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "ALREADY_FULLY_RETURNED");
});
