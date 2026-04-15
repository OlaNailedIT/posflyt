const { test } = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const {
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_TYPE_VALUES,
  AUDIT_ENTITY_TYPE_VALUES,
  AUDIT_ACTION_VALUES,
} = require("../src/config/auditEventTypes");
const { analyzeCorrelation } = require("../src/audit/auditCorrelationAnalyzer");

test("audit event type contract is stable", () => {
  assert.equal(AUDIT_EVENT_TYPES.SALE_CREATED, "SALE_CREATED");
  assert.equal(AUDIT_EVENT_TYPE_VALUES.length, 7);
  assert.ok(AUDIT_ENTITY_TYPE_VALUES.includes("transaction"));
  assert.ok(AUDIT_ACTION_VALUES.includes("CREATE"));
});

test("zod enum rejects unknown audit event type", () => {
  const E = /** @type {[string, ...string[]]} */ ([...AUDIT_EVENT_TYPE_VALUES]);
  const schema = z.object({ type: z.enum(E) });
  assert.equal(schema.safeParse({ type: "SALE_CREATED" }).success, true);
  assert.equal(schema.safeParse({ type: "SALE_CREATE_TYPO" }).success, false);
});

test("analyzeCorrelation summarizes risk", () => {
  const s = analyzeCorrelation([{ type: AUDIT_EVENT_TYPES.RETURN_CREATED, entityType: "transaction" }]);
  assert.equal(s.hasReturn, true);
  assert.equal(s.hasInventoryChange, false);
  assert.equal(s.riskScore >= 2, true);
});
