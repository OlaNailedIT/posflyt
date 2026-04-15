const { randomUUID } = require("crypto");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const email = `expense_${Date.now()}@posflyt.test`;
let token = "";
let businessId = "";

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("setup account for expense tests", async () => {
  const register = await request(app).post("/auth/register").send({
    businessName: "Expense Biz",
    name: "Owner",
    email,
    password: "secret12",
  });
  assert.equal(register.status, 201);
  token = register.body.data.token;
  businessId = register.body.data.user.business_id;
});

test("reject invalid expense amount", async () => {
  const res = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 0,
      category: "Test",
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "INVALID_EXPENSE_AMOUNT");
});

test("reject blank category", async () => {
  const res = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 10,
      category: "   ",
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "INVALID_EXPENSE_CATEGORY");
});

test("create expense and see it in daily summary", async () => {
  const rid = randomUUID();
  const eid = randomUUID();
  const create = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 5000,
      category: "Transport",
      note: "Fuel",
      request_id: rid,
      event_id: eid,
    });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.expense.category, "transport");
  assert.equal(create.body.data.expense.amount, 5000);

  const from = new Date();
  const dayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));

  const summary = await request(app)
    .get("/reports/daily-summary")
    .set("Authorization", `Bearer ${token}`)
    .query({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.totalExpenses, 5000);
  assert.equal(summary.body.data.totalSales, 0);
  assert.equal(summary.body.data.profit, -5000);
  assert.equal(summary.body.data.grossProfit, 0);
  assert.equal(summary.body.data.dailyProfit, -5000);
  assert.equal(summary.body.data.netProfit, -5000);
  assert.equal(summary.body.data.date, dayStart.toISOString().slice(0, 10));
  assert.equal(summary.body.data.profitType, "net");
});

test("multiple expenses aggregate in summary", async () => {
  await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 2000,
      category: "Rent",
      request_id: randomUUID(),
      event_id: randomUUID(),
    });
  const from = new Date();
  const dayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));

  const summary = await request(app)
    .get("/reports/daily-summary")
    .set("Authorization", `Bearer ${token}`)
    .query({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.totalExpenses, 7000);
  assert.equal(summary.body.data.grossProfit, 0);
  assert.equal(summary.body.data.dailyProfit, -7000);
  assert.equal(summary.body.data.netProfit, -7000);
});

test("daily summary: multi-day range has date null and dateFrom/dateTo set", async () => {
  const d0 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
  const d1 = new Date(Date.UTC(2026, 0, 2, 23, 59, 59, 999));
  const summary = await request(app)
    .get("/reports/daily-summary")
    .set("Authorization", `Bearer ${token}`)
    .query({
      from: d0.toISOString(),
      to: d1.toISOString(),
    });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.date, null);
  assert.equal(summary.body.data.dateFrom, "2026-01-01");
  assert.equal(summary.body.data.dateTo, "2026-01-02");
  assert.equal(typeof summary.body.data.dailyProfit, "number");
});

test("idempotency returns DUPLICATE_REQUEST for same request_id", async () => {
  const rid = randomUUID();
  const first = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 100,
      category: "Supplies",
      request_id: rid,
      event_id: randomUUID(),
    });
  assert.equal(first.status, 201);

  const second = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 9999,
      category: "Ignored",
      request_id: rid,
      event_id: randomUUID(),
    });
  assert.equal(second.status, 200);
  assert.equal(second.body.code, "DUPLICATE_REQUEST");
  assert.equal(second.body.data.expense.amount, 100);
});

test("sync duplicate event_id is ignored (same expense returned)", async () => {
  const eid = randomUUID();
  const first = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 50,
      category: "Other",
      request_id: randomUUID(),
      event_id: eid,
    });
  assert.equal(first.status, 201);

  const second = await request(app)
    .post("/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      amount: 999,
      category: "Ignored",
      request_id: randomUUID(),
      event_id: eid,
    });
  assert.equal(second.status, 200);
  assert.equal(second.body.code, "SYNC_DUPLICATE_EVENT");
  assert.equal(second.body.data.expense.amount, 50);

  const rows = await prisma.expense.count({
    where: { businessId, eventId: eid },
  });
  assert.equal(rows, 1);
});

test("gross profit: sales 100k minus expenses 30k equals 70k", async () => {
  const reg = await request(app).post("/auth/register").send({
    businessName: "Profit Seal",
    name: "Owner",
    email: `expense_profit_${Date.now()}@posflyt.test`,
    password: "secret12",
  });
  assert.equal(reg.status, 201);
  const t = reg.body.data.token;
  const pid = randomUUID();
  const prod = await request(app).post("/products").set("Authorization", `Bearer ${t}`).send({
    id: pid,
    name: "High ticket",
    price: 100000,
    stock: 5,
    lowStockThreshold: 1,
  });
  assert.equal(prod.status, 201);

  const tx = await request(app).post("/transactions").set("Authorization", `Bearer ${t}`).send({
    client_transaction_id: randomUUID(),
    created_at: new Date().toISOString(),
    payment_method: "CASH",
    payment_status: "paid",
    items: [{ product_id: pid, quantity: 1 }],
  });
  assert.equal(tx.status, 201);

  const ex = await request(app).post("/expenses").set("Authorization", `Bearer ${t}`).send({
    amount: 30000,
    category: "overhead",
    request_id: randomUUID(),
    event_id: randomUUID(),
  });
  assert.equal(ex.status, 201);

  const from = new Date();
  const dayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));

  const summary = await request(app)
    .get("/reports/daily-summary")
    .set("Authorization", `Bearer ${t}`)
    .query({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.totalSales, 100000);
  assert.equal(summary.body.data.totalExpenses, 30000);
  assert.equal(summary.body.data.profit, 70000);
  assert.equal(summary.body.data.grossProfit, 100000);
  assert.equal(summary.body.data.netProfit, 70000);
  assert.equal(summary.body.data.dailyProfit, 70000);
  assert.equal(summary.body.data.profitType, "net");

  const dash = await request(app).get("/dashboard-stats").set("Authorization", `Bearer ${t}`);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.revenue, 100000);
  assert.equal(dash.body.data.cogs, 0);
  assert.equal(dash.body.data.totalExpenses, 30000);
  assert.equal(dash.body.data.profit, 70000);
  assert.equal(dash.body.data.grossProfit, 100000);
  assert.equal(dash.body.data.netProfit, 70000);
  assert.equal(dash.body.data.dailyProfit, 70000);
  assert.equal(dash.body.data.date, dayStart.toISOString().slice(0, 10));
  assert.equal(dash.body.data.profitType, "net");

  const debug = await request(app).get("/debug/expenses").set("Authorization", `Bearer ${t}`).query({
    date: dayStart.toISOString().slice(0, 10),
  });
  assert.equal(debug.status, 200);
  assert.equal(debug.body.data.totalSales, 100000);
  assert.equal(debug.body.data.totalExpenses, 30000);
  assert.equal(debug.body.data.profit, 70000);
  assert.equal(debug.body.data.grossProfit, 100000);
  assert.equal(debug.body.data.dailyProfit, 70000);
  assert.equal(debug.body.data.profitType, "net");
  assert.ok(Array.isArray(debug.body.data.expenses));
});

test("GET /expenses/meta returns suggested categories", async () => {
  const res = await request(app).get("/expenses/meta").set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.suggestedCategories));
  assert.ok(res.body.data.suggestedCategories.includes("fuel"));
});

test("three expenses with sync ids then replay same request_ids — no extra rows, total stable", async () => {
  const reg = await request(app).post("/auth/register").send({
    businessName: "Offline Seal",
    name: "Owner",
    email: `expense_offline_${Date.now()}@posflyt.test`,
    password: "secret12",
  });
  assert.equal(reg.status, 201);
  const t = reg.body.data.token;
  const bid = reg.body.data.user.business_id;
  const r1 = randomUUID();
  const r2 = randomUUID();
  const r3 = randomUUID();
  const e1 = randomUUID();
  const e2 = randomUUID();
  const e3 = randomUUID();

  for (const [amt, rid, eid] of [
    [100, r1, e1],
    [200, r2, e2],
    [300, r3, e3],
  ]) {
    const res = await request(app).post("/expenses").set("Authorization", `Bearer ${t}`).send({
      amount: amt,
      category: "syncbatch",
      request_id: rid,
      event_id: eid,
    });
    assert.equal(res.status, 201);
  }
  assert.equal(await prisma.expense.count({ where: { businessId: bid } }), 3);

  for (const rid of [r1, r2, r3]) {
    const res = await request(app).post("/expenses").set("Authorization", `Bearer ${t}`).send({
      amount: 99999,
      category: "ignored",
      request_id: rid,
      event_id: randomUUID(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.code, "DUPLICATE_REQUEST");
  }
  assert.equal(await prisma.expense.count({ where: { businessId: bid } }), 3);

  const from = new Date();
  const dayStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));

  const summary = await request(app)
    .get("/reports/daily-summary")
    .set("Authorization", `Bearer ${t}`)
    .query({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.totalExpenses, 600);
  assert.equal(summary.body.data.grossProfit, 0);
  assert.equal(summary.body.data.dailyProfit, -600);
  assert.equal(summary.body.data.netProfit, -600);
});
