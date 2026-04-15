#!/usr/bin/env node
/**
 * Phase 6 — optional guard when CI runs with NODE_ENV=production (misconfiguration).
 * Normal CI uses NODE_ENV=test and exits successfully.
 */
if (process.env.NODE_ENV === "production" && process.env.CI) {
  // eslint-disable-next-line no-console
  console.log("CI production environment detected (NODE_ENV=production + CI=true)");

  if (process.env.ALLOW_MIGRATE !== "true") {
    // eslint-disable-next-line no-console
    console.error("Migrations disabled in CI when NODE_ENV=production unless ALLOW_MIGRATE=true");
    process.exit(1);
  }
}
