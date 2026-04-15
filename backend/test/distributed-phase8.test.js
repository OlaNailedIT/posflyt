const assert = require("assert");
const { test } = require("node:test");
const { streamTopicForBusiness } = require("../src/sharding/streamNaming");
const { describeRoute } = require("../src/sharding/router");
const { buildSnapshotLineage, lineageMergeAllowed } = require("../src/distributed/snapshotLineage");
const { getRegionClient } = require("../src/distributed/regionClient/regionClient");
const { isRegionWritable } = require("../src/distributed/failoverGuard");

test("streamTopicForBusiness matches router stream", () => {
  const bid = "550e8400-e29b-41d4-a716-446655440000";
  const route = describeRoute(bid);
  const topic = streamTopicForBusiness(bid);
  assert.equal(topic, route.stream);
  assert.ok(topic.startsWith("vessa."));
  assert.ok(topic.endsWith(".events"));
});

test("describeRoute exposes db + stream (Phase 8.1)", () => {
  const route = describeRoute("biz-test-uuid");
  assert.ok(route.db);
  assert.equal(typeof route.db.regionId, "string");
  assert.ok(["primary", "region_configured"].includes(route.db.dataSource));
  assert.equal(typeof route.db.hasDedicatedPool, "boolean");
  assert.ok(route.stream);
});

test("getRegionClient returns primary façade by default", () => {
  const rc = getRegionClient("eu-west-1");
  assert.equal(rc.dataSource, "primary");
  assert.equal(rc.regionId, "eu-west-1");
  assert.ok(rc.prisma);
});

test("snapshot lineage merge gate", () => {
  const a = buildSnapshotLineage({ eventCount: 3, lastEventId: "e1" }, "eu");
  const b = buildSnapshotLineage({ eventCount: 3, lastEventId: "e2" }, "eu");
  assert.equal(lineageMergeAllowed([a, b]).ok, true);
  const c = buildSnapshotLineage({ eventCount: 4, lastEventId: "e3" }, "eu");
  assert.equal(lineageMergeAllowed([a, c]).ok, false);
});

test("failoverGuard isRegionWritable defaults (depends on env)", () => {
  const w = isRegionWritable("any-peer-region-id");
  assert.equal(typeof w, "boolean");
});
