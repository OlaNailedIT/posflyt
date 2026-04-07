const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  recordHttpRequest,
  getPrometheusMetricsText,
  routeGroupFromPath,
} = require("../src/services/runtimeMetricsService");

test("routeGroupFromPath buckets first path segment", () => {
  assert.equal(routeGroupFromPath("/health"), "health");
  assert.equal(routeGroupFromPath("/transactions/sync"), "transactions");
  assert.equal(routeGroupFromPath("/v1/foo"), "other");
});

test("Prometheus text includes counters after recording HTTP", () => {
  recordHttpRequest({
    method: "GET",
    originalUrl: "/health",
    statusCode: 200,
    durationSeconds: 0.002,
  });
  const text = getPrometheusMetricsText();
  assert.ok(text.includes("posflyt_http_requests_total"));
  assert.ok(text.includes('route_group="health"'));
  assert.ok(text.includes("posflyt_process_uptime_seconds"));
  assert.ok(text.includes("posflyt_http_request_duration_seconds"));
  assert.ok(text.includes("posflyt_node_event_loop_delay_mean_seconds"));
});
