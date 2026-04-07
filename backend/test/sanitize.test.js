const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizePlainText,
  sanitizeDisplayName,
  sanitizeProductCode,
  normalizeEmail,
} = require("../src/utils/sanitize");

test("sanitizePlainText strips tags and control chars", () => {
  assert.equal(sanitizePlainText("  hello "), "hello");
  assert.equal(sanitizePlainText("<b>x</b>"), "x");
  assert.equal(sanitizePlainText("a\u0000b"), "ab");
});

test("sanitizeDisplayName caps length", () => {
  const long = "x".repeat(200);
  assert.equal(sanitizeDisplayName(long, 5).length, 5);
});

test("normalizeEmail lowercases", () => {
  assert.equal(normalizeEmail("User@Example.COM"), "user@example.com");
});

test("sanitizeProductCode allows common sku chars", () => {
  assert.ok(sanitizeProductCode("SKU-123.45").includes("SKU"));
});
