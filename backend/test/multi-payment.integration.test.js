const crypto = require("crypto");
const { randomUUID } = crypto;

function stableStringify(value) {
  if (value === null || typeof value === "undefined") return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** Matches browser `attachPayloadHash` / backend duplicate check. */
function withPayloadHash(body) {
  const hash = crypto.createHash("sha256").update(stableStringify(body)).digest("hex");
  return { ...body, payload_hash: hash };
}
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
  const base = {
    client_transaction_id: txId,
    created_at: new Date().toISOString(),
    payment_status: "paid",
    payments: [
      { type: "CASH", amount: 40 },
      { type: "TRANSFER", amount: 60 },
    ],
    items: [{ product_id: productId, quantity: 1 }],
  };
  const res = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(withPayloadHash(base));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.synced, 1);
  assert.equal(res.body.data.contractVersion, 2);

  const row = await prisma.transaction.findUnique({ where: { id: txId } });
  assert.equal(row.paymentMethod, "MULTI");
  assert.ok(Array.isArray(row.payments));
  assert.equal(row.payments.length, 2);
  assert.equal(row.totalAmount, 100);
  assert.equal(row.amountPaid, 100);
  assert.equal(row.payloadHash, crypto.createHash("sha256").update(stableStringify(base)).digest("hex"));
});

test("GET /transactions returns payments array", async () => {
  const list = await request(app).get("/transactions").set("Authorization", `Bearer ${token}`);
  assert.equal(list.status, 200);
  const multi = list.body.data.find((t) => t.paymentMethod === "MULTI");
  assert.ok(multi);
  assert.ok(Array.isArray(multi.payments));
});

test("GET /transactions/:clientTransactionId returns committed sale for reconciliation", async () => {
  const txId = randomUUID();
  const base = {
    client_transaction_id: txId,
    created_at: new Date().toISOString(),
    payment_method: "CASH",
    items: [{ product_id: productId, quantity: 1 }],
  };
  const created = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(withPayloadHash(base));
  assert.equal(created.status, 201);

  const lookup = await request(app)
    .get(`/transactions/${txId}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.data.contractVersion, 2);
  assert.equal(lookup.body.data.transaction.id, txId);
  assert.equal(lookup.body.data.transaction.paymentMethod, "CASH");
});

test("duplicate client_transaction_id with different payload hash returns IDEMPOTENCY_PAYLOAD_MISMATCH", async () => {
  const txId = randomUUID();
  const base1 = {
    client_transaction_id: txId,
    created_at: new Date().toISOString(),
    payment_method: "CASH",
    items: [{ product_id: productId, quantity: 1 }],
  };
  const first = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(withPayloadHash(base1));
  assert.equal(first.status, 201);

  const base2 = {
    ...base1,
    items: [{ product_id: productId, quantity: 2 }],
  };
  const second = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${token}`)
    .send(withPayloadHash(base2));
  assert.equal(second.status, 207);
  const r = second.body.data.results[0];
  assert.equal(r.status, "failed");
  assert.equal(r.code, "IDEMPOTENCY_PAYLOAD_MISMATCH");
});

test("GET /transactions/:clientTransactionId returns 404 for unknown id", async () => {
  const unknown = randomUUID();
  const lookup = await request(app)
    .get(`/transactions/${unknown}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(lookup.status, 404);
  assert.equal(lookup.body.code, "NOT_FOUND");
});
