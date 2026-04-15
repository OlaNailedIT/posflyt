const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runChaosScenario } = require("../src/chaos/scenarios/chaosScenarioRunner");

test("EVENT_STORM_PARTITION publishes to in-memory bus and returns metrics", async () => {
  const fakeBiz = "00000000-0000-4000-8000-0000000000f9";
  const out = await runChaosScenario(fakeBiz, "EVENT_STORM_PARTITION", "LOW");
  assert.ok(out.metrics.transactionsTested > 0);
  assert.ok(out.resilienceScore >= 0 && out.resilienceScore <= 100);
  assert.ok(Array.isArray(out.timeline));
});
