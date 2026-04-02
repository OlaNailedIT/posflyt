const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `crm_${Date.now()}@posflyt.test`;
let token = "";
let productId = "";
let customerId = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account and inventory", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "CRM Biz",
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
      name: "CRM SKU",
      price: 100,
      stock: 5,
      lowStockThreshold: 8,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;
});

test("customers api and customer-linked transaction with receipt", async () => {
  const createdCustomer = await request(app)
    .post("/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Jane Buyer",
      phone: "08000000000",
      email: "jane@example.com",
    });
  assert.equal(createdCustomer.status, 201);
  customerId = createdCustomer.body.data.id;

  const tx = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      customer_id: customerId,
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(tx.status, 201);
  assert.ok(tx.body.data.results?.[0]?.receipt);
  assert.equal(tx.body.data.results?.[0]?.transaction?.customerId, customerId);
});

test("dashboard low stock + reports + csv export", async () => {
  const dashboard = await request(app).get("/dashboard-stats").set("Authorization", `Bearer ${token}`);
  assert.equal(dashboard.status, 200);
  assert.ok(Array.isArray(dashboard.body.data.lowStockProducts));

  await prisma.subscription.update({
    where: { businessId },
    data: { plan: "BASIC" },
  });

  const report = await request(app).get("/reports/sales").set("Authorization", `Bearer ${token}`);
  assert.equal(report.status, 200);
  assert.ok(typeof report.body.data.totalSales === "number");
  assert.ok(typeof report.body.data.transactionsCount === "number");

  const csv = await request(app).get("/exports/customers").set("Authorization", `Bearer ${token}`);
  assert.equal(csv.status, 200);
  assert.match(csv.text, /name,phone,email/i);
});
