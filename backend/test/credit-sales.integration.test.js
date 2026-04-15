const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `credit_${Date.now()}@posflyt.test`;
let token = "";
let productId = "";
let customerCredit = "";
let customerPartial = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for credit sales tests", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Credit Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;

  const product = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      id: randomUUID(),
      name: "Credit SKU",
      price: 100,
      stock: 10,
      lowStockThreshold: 2,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;

  const c1 = await request(app)
    .post("/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Credit Customer",
      phone: "08011111111",
    });
  assert.equal(c1.status, 201);
  customerCredit = c1.body.data.id;

  const c2 = await request(app)
    .post("/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Partial Customer",
      phone: "08022222222",
    });
  assert.equal(c2.status, 201);
  customerPartial = c2.body.data.id;
});

test("full payment leaves no outstanding", async () => {
  const tx = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      customer_id: customerCredit,
      payment_method: "CASH",
      payment_status: "paid",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(tx.status, 201);
  assert.equal(tx.body.data.paymentStatus, "paid");
  assert.equal(tx.body.data.balanceDue, 0);

  const cust = await prisma.customer.findUnique({ where: { id: customerCredit } });
  assert.equal(Number(cust.totalOutstanding), 0);
});

test("credit sale records balance and increments outstanding", async () => {
  const tx = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      customer_id: customerCredit,
      payment_method: "CASH",
      payment_status: "credit",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(tx.status, 201);
  assert.equal(tx.body.data.paymentStatus, "credit");
  assert.equal(tx.body.data.balanceDue, 100);

  const cust = await prisma.customer.findUnique({ where: { id: customerCredit } });
  assert.equal(Number(cust.totalOutstanding), 100);
});

test("partial payment splits balance correctly", async () => {
  const tx = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      customer_id: customerPartial,
      payment_method: "CASH",
      payment_status: "partial",
      amount_paid: 40,
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(tx.status, 201);
  assert.equal(tx.body.data.paymentStatus, "partial");
  assert.equal(tx.body.data.balanceDue, 60);

  const cust = await prisma.customer.findUnique({ where: { id: customerPartial } });
  assert.equal(Number(cust.totalOutstanding), 60);
});

test("settle credit reduces outstanding", async () => {
  const beforeCust = await prisma.customer.findUnique({ where: { id: customerCredit } });
  const dueBefore = Number(beforeCust.totalOutstanding);
  assert.ok(dueBefore > 0);

  const settle = await request(app)
    .post(`/customers/${customerCredit}/settle-credit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 40 });

  assert.equal(settle.status, 200);
  assert.equal(Number(settle.body.data.totalOutstanding), dueBefore - 40);

  const afterCust = await prisma.customer.findUnique({ where: { id: customerCredit } });
  assert.equal(Number(afterCust.totalOutstanding), dueBefore - 40);
});

test("settle rejects amount above outstanding", async () => {
  const cust = await prisma.customer.findUnique({ where: { id: customerCredit } });
  const due = Number(cust.totalOutstanding);

  const settle = await request(app)
    .post(`/customers/${customerCredit}/settle-credit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: due + 1000 });

  assert.equal(settle.status, 400);
  assert.equal(settle.body.code, "EXCEEDS_OUTSTANDING");
});

test("transaction settle is idempotent for same request_id", async () => {
  const txId = randomUUID();
  const create = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: txId,
      created_at: new Date().toISOString(),
      customer_id: customerCredit,
      payment_method: "CASH",
      payment_status: "credit",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(create.status, 201);

  const rid = randomUUID();
  const s1 = await request(app)
    .post(`/transactions/${txId}/settle-credit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 25, request_id: rid });
  assert.equal(s1.status, 200);

  const s2 = await request(app)
    .post(`/transactions/${txId}/settle-credit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 25, request_id: rid });
  assert.equal(s2.status, 200);
  assert.equal(s2.body.data.idempotent, true);
});

test("FIFO customer settle applies to oldest debt first", async () => {
  const c = await request(app)
    .post("/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "FIFO Test", phone: "08033333333" });
  assert.equal(c.status, 201);
  const fifoCustomerId = c.body.data.id;

  const tx1 = randomUUID();
  await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: tx1,
      created_at: new Date(Date.now() - 60_000).toISOString(),
      customer_id: fifoCustomerId,
      payment_method: "CASH",
      payment_status: "credit",
      items: [{ product_id: productId, quantity: 1 }],
    });
  const tx2 = randomUUID();
  await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: tx2,
      created_at: new Date().toISOString(),
      customer_id: fifoCustomerId,
      payment_method: "CASH",
      payment_status: "credit",
      items: [{ product_id: productId, quantity: 1 }],
    });

  const settle = await request(app)
    .post(`/customers/${fifoCustomerId}/settle-credit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ amount: 100 });
  assert.equal(settle.status, 200);

  const first = await prisma.transaction.findUnique({ where: { id: tx1 } });
  const second = await prisma.transaction.findUnique({ where: { id: tx2 } });
  assert.equal(Number(first.balanceDue), 0);
  assert.equal(Number(second.balanceDue), 100);
});
