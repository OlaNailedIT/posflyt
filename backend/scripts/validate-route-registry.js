#!/usr/bin/env node
/**
 * Validates that `src/app.js` router mounts match `src/config/routeRegistry.js`.
 * Run: node scripts/validate-route-registry.js
 */
const fs = require("fs");
const path = require("path");
const {
  expectedRouterMounts,
  expectedDevRouterMounts,
  requiredRouteModules,
} = require("../src/config/routeRegistry");

const appPath = path.join(__dirname, "../src/app.js");
const appSource = fs.readFileSync(appPath, "utf8");

function extractAppUsePairs(source) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  const re = /app\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    pairs.push([m[1], m[2]]);
  }
  return pairs;
}

function multisetFromKeys(keys) {
  const map = new Map();
  for (const k of keys) {
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function compareMultisets(expected, actual) {
  const e = multisetFromKeys(expected.map(([a, b]) => `${a}\0${b}`));
  const a = multisetFromKeys(actual.map(([p, q]) => `${p}\0${q}`));
  const errors = [];
  const allKeys = new Set([...e.keys(), ...a.keys()]);
  for (const k of allKeys) {
    const diff = (e.get(k) || 0) - (a.get(k) || 0);
    if (diff !== 0) {
      const [prefix, handler] = k.split("\0");
      if (diff > 0) {
        errors.push(`MISSING in app.js: app.use("${prefix}", ${handler}) (${diff} occurrence(s))`);
      } else {
        errors.push(`EXTRA in app.js: app.use("${prefix}", ${handler}) (${-diff} occurrence(s))`);
      }
    }
  }
  return errors;
}

function validateRequiredRouteRequires() {
  const errors = [];
  for (const mod of requiredRouteModules) {
    if (!appSource.includes(`require("./routes/${mod}")`)) {
      errors.push(`app.js must require("./routes/${mod}")`);
    }
  }
  return errors;
}

const actualPairs = extractAppUsePairs(appSource);
const expectedPairs = [...expectedRouterMounts, ...expectedDevRouterMounts];

const mountErrors = compareMultisets(expectedPairs, actualPairs);
const requireErrors = validateRequiredRouteRequires();

if (mountErrors.length > 0 || requireErrors.length > 0) {
  // eslint-disable-next-line no-console
  console.error("\n[validate-route-registry] FAILED\n");
  mountErrors.forEach((e) => console.error(" -", e));
  requireErrors.forEach((e) => console.error(" -", e));
  // eslint-disable-next-line no-console
  console.error(
    "\nUpdate src/app.js and/or src/config/routeRegistry.js so expected mounts match.\n"
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(
  `[validate-route-registry] OK (${expectedPairs.length} app.use mounts, ${requiredRouteModules.length} route modules)`
);
