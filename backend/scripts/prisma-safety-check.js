#!/usr/bin/env node
/**
 * Phase 6 — environment policy (Step 6.3) + blocks destructive Prisma commands on
 * production-like hosts, then forwards to `npx prisma …`.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const {
  assertMigrationAction,
  detectMigrationAction,
  getMigrationTier,
} = require("./prisma-env-policy");

const isProd = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);
const isRender = Boolean(process.env.RENDER);

const args = process.argv.slice(2);
const commandLine = args.join(" ");

function isProductionLike() {
  return isProd || isVercel || isRender;
}

if (args.length === 0) {
  // eslint-disable-next-line no-console
  console.error("Usage: node scripts/prisma-safety-check.js <prisma subcommand …>");
  console.error("Example: node scripts/prisma-safety-check.js prisma migrate deploy");
  process.exit(1);
}

const migrationAction = detectMigrationAction(args);

if (migrationAction) {
  assertMigrationAction(migrationAction);
}

/** CI must exercise migrations under staging-tier policy (deploy-only validation). */
if (
  process.env.CI === "true" &&
  migrationAction &&
  getMigrationTier() !== "staging"
) {
  // eslint-disable-next-line no-console
  console.error(
    "[prisma-safety-check] CI migration validation requires staging-tier policy (e.g. MIGRATION_ENV=staging, or NODE_ENV=test with CI=true)."
  );
  process.exit(1);
}

const forbiddenInProd = ["migrate reset", "db push"];

if (isProductionLike()) {
  // eslint-disable-next-line no-console
  console.log("[prisma-safety-check] Running checks (production-like environment)…");

  for (const cmd of forbiddenInProd) {
    if (commandLine.includes(cmd)) {
      // eslint-disable-next-line no-console
      console.error(`[prisma-safety-check] Forbidden in production-like environment: ${cmd}`);
      process.exit(1);
    }
  }

  // eslint-disable-next-line no-console
  console.log("[prisma-safety-check] OK.");
}

if (commandLine.includes("migrate deploy") && getMigrationTier() === "production") {
  // eslint-disable-next-line no-console
  console.warn(`[prisma-safety-check] PRODUCTION MIGRATION EXECUTION
- Ensure backup exists
- Ensure staging passed
- Ensure migration diff reviewed
- Ensure shadow DB is configured (for drift / migrate diff tooling)
- Ensure no schema drift vs prisma/migrations
`);
}

// argv e.g. [ 'prisma', 'migrate', 'deploy' ] → npx prisma migrate deploy
const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
  cwd: path.resolve(__dirname, ".."),
});

process.exit(result.status === null ? 1 : result.status);
