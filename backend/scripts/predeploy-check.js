#!/usr/bin/env node
/**
 * Phase 6.4 — lightweight checks to run before migrate deploy / production start.
 * Does not connect to the database (only `prisma validate` on schema).
 */
const { execSync } = require("child_process");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");

function run(cmd) {
  execSync(cmd, {
    stdio: "inherit",
    cwd: backendRoot,
    env: process.env,
    shell: process.platform === "win32",
  });
}

try {
  run("npx prisma validate");
  // eslint-disable-next-line no-console
  console.log("[predeploy-check] Prisma schema valid.");
  // eslint-disable-next-line no-console
  console.log("[predeploy-check] Predeploy checks passed.");
} catch {
  // eslint-disable-next-line no-console
  console.error("[predeploy-check] FAILED.");
  process.exit(1);
}
