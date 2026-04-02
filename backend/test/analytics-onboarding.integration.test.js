const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `analytics_${Date.now()}@posflyt.test`;
let token = "";
let businessId = "";
let productId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for analytics and onboarding", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Analytics Biz",
    name: "Admin User",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;

  const onboarding = await request(app)
    .get("/onboarding/status")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(onboarding.status, 200);
  assert.equal(onboarding.body.data.firstProductDone, false);
  assert.equal(onboarding.body.data.firstSaleDone, false);
});

test("free plan blocks advanced analytics", async () => {
  const profit = await request(app)
    .get("/analytics/profit")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(profit.status, 403);
});

test("basic plan enables analytics and staff endpoints", async () => {
  await prisma.subscription.update({
    where: { businessId },
    data: { plan: "BASIC" },
  });

  const product = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      id: randomUUID(),
      name: "Profit SKU",
      sellingPrice: 120,
      costPrice: 60,
      price: 120,
      stock: 10,
    });
  assert.equal(product.status, 201);
  productId = product.body.data.id;

  const tx = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 2 }],
    });
  assert.equal(tx.status, 201);

  const onboardingAfter = await request(app)
    .get("/onboarding/status")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(onboardingAfter.status, 200);
  assert.equal(onboardingAfter.body.data.firstProductDone, true);
  assert.equal(onboardingAfter.body.data.firstSaleDone, true);

  const profit = await request(app)
    .get("/analytics/profit")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(profit.status, 200);
  assert.ok(typeof profit.body.data.daily.profit === "number");
  assert.ok(typeof profit.body.data.weekly.profit === "number");

  const staff = await request(app)
    .get("/analytics/staff-performance")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(staff.status, 200);
  assert.ok(Array.isArray(staff.body.data));

  const alerts = await request(app)
    .get("/analytics/smart-alerts")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(alerts.status, 200);
  assert.ok(Array.isArray(alerts.body.data));

  const insights = await request(app)
    .get("/analytics/insights")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(insights.status, 200);
  assert.ok(Array.isArray(insights.body.data.suggestions));
});
