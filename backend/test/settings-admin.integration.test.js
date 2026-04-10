const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const { signAuthToken } = require("../src/utils/jwt");

const ownerEmail = `settings_owner_${Date.now()}@posflyt.test`;

let adminToken = "";
let businessId = "";
let productId = "";
let cashierToken = "";
let createdStaffEmail = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup owner account", async () => {
  const res = await request(app).post("/auth/register").send({
    businessName: "Settings Test Biz",
    name: "Owner User",
    email: ownerEmail,
    password: "secret12",
  });
  assert.equal(res.status, 201);
  adminToken = res.body.data.token;
  businessId = res.body.data.user.business_id;
});

test("GET /settings creates defaults when missing", async () => {
  const res = await request(app).get("/settings").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.businessId, businessId);
  assert.equal(res.body.data.currencySymbol, "$");

  const reliability = await request(app)
    .get("/system/reliability-summary")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(reliability.status, 200);
  assert.equal(reliability.body.status, "ok");
  assert.ok(typeof reliability.body.data.syncSuccessRate === "number");
});

test("PUT /settings updates business settings (admin only)", async () => {
  const updateRes = await request(app)
    .put("/settings")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      currencySymbol: "₦",
      taxEnabled: true,
      taxRate: 7.5,
      businessName: "Settings Test Biz Updated",
      businessEmail: "owner@settings-test.biz",
      businessPhone: "+234000111222",
      // Unknown fields are ignored in MVP-safe settings handling.
      countryCode: "NG",
      currencyCode: "NGN",
      taxRules: [{ countryCode: "NG", enabled: true, rate: 7.5 }],
      logoUrl: "https://example.com/logo.png",
      receiptLayout: "COMPACT",
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.currencySymbol, "₦");
  assert.equal(updateRes.body.data.taxEnabled, true);
});

test("staff management: admin can create/list, non-admin blocked, duplicate rejected", async () => {
  createdStaffEmail = `staff_${Date.now()}@posflyt.test`;
  const createStaffRes = await request(app)
    .post("/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      name: "Front Cashier",
      email: createdStaffEmail,
      password: "secret12",
      role: "CASHIER",
    });
  assert.equal(createStaffRes.status, 201);
  assert.equal(createStaffRes.body.status, "ok");
  assert.equal(createStaffRes.body.data.email, createdStaffEmail);
  assert.equal(createStaffRes.body.data.role, "CASHIER");

  const listStaffRes = await request(app)
    .get("/staff")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(listStaffRes.status, 200);
  assert.equal(listStaffRes.body.status, "ok");
  assert.ok(Array.isArray(listStaffRes.body.data));
  assert.ok(listStaffRes.body.data.some((u) => u.email === createdStaffEmail));

  const duplicateRes = await request(app)
    .post("/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      name: "Front Cashier 2",
      email: createdStaffEmail,
      password: "secret12",
      role: "CASHIER",
    });
  assert.equal(duplicateRes.status, 409);
  assert.equal(duplicateRes.body.status, "error");
  assert.equal(duplicateRes.body.code, "EMAIL_ALREADY_IN_USE");

  const disableRes = await request(app)
    .post(`/staff/${createStaffRes.body.data.id}/disable`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(disableRes.status, 200);
  assert.equal(disableRes.body.data.status, "disabled");

  const disabledLogin = await request(app).post("/auth/login").send({
    email: createdStaffEmail,
    password: "secret12",
  });
  assert.equal(disabledLogin.status, 401);

  const reactivateRes = await request(app)
    .post(`/staff/${createStaffRes.body.data.id}/reactivate`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ password: "secret34" });
  assert.equal(reactivateRes.status, 200);
  assert.equal(reactivateRes.body.data.status, "active");

  const reactivatedLogin = await request(app).post("/auth/login").send({
    email: createdStaffEmail,
    password: "secret34",
  });
  assert.equal(reactivatedLogin.status, 200);
});

test("cashier restrictions and admin sales feed visibility", async () => {
  const cashier = await prisma.user.create({
    data: {
      name: "Cashier User",
      email: `cashier_${Date.now()}@posflyt.test`,
      password: "hashed-not-used",
      role: "CASHIER",
      businessId,
    },
  });
  cashierToken = signAuthToken({
    userId: cashier.id,
    businessId,
    role: cashier.role,
  });

  const productRes = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      id: randomUUID(),
      name: "Sales Feed SKU",
      price: 1500,
      stock: 10,
    });
  assert.equal(productRes.status, 201);
  productId = productRes.body.data.id;

  const txRes = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({
      client_transaction_id: randomUUID(),
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 1 }],
    });
  assert.equal(txRes.status, 201);

  const feedRes = await request(app)
    .get("/admin/sales-feed")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(feedRes.status, 200);
  assert.ok(Array.isArray(feedRes.body.data));
  assert.equal(feedRes.body.data[0].sellerName, "Cashier User");
  assert.ok(feedRes.body.data[0].time);
  assert.ok(feedRes.body.data[0].date);

  const cashierFeedRes = await request(app)
    .get("/admin/sales-feed")
    .set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(cashierFeedRes.status, 403);

  const cashierSettingsRes = await request(app)
    .put("/settings")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({
      currencySymbol: "$",
      taxEnabled: false,
      taxRate: 0,
      businessName: "Should Fail",
      businessEmail: "cashier@fail.test",
      businessPhone: "",
      countryCode: "US",
      currencyCode: "USD",
      taxRules: [{ countryCode: "US", enabled: false, rate: 0 }],
    });
  assert.equal(cashierSettingsRes.status, 403);

  const cashierStaffRes = await request(app)
    .get("/staff")
    .set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(cashierStaffRes.status, 403);
  assert.equal(cashierStaffRes.body.status, "error");
  assert.equal(cashierStaffRes.body.code, "ADMIN_REQUIRED");
});

test("daily close status and confirmation", async () => {
  const statusRes = await request(app)
    .get("/admin/daily-close")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.status, "ok");
  assert.equal(typeof statusRes.body.data.transactionCount, "number");
  assert.equal(typeof statusRes.body.data.totalRevenue, "number");

  const closeRes = await request(app)
    .post("/admin/daily-close")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.body.status, "ok");
  assert.equal(closeRes.body.data.isClosed, true);
  assert.ok(closeRes.body.data.closeSummary?.dailyCloseId);

  const cashierCloseRes = await request(app)
    .post("/admin/daily-close")
    .set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(cashierCloseRes.status, 403);
});
