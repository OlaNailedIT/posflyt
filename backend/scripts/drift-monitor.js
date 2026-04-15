#!/usr/bin/env node
/**
 * Thin post-deploy correctness monitor (read-only).
 * Uses existing audit + Prisma aggregates — no new tables.
 *
 *   cd backend && npm run drift:monitor
 *   cd backend && npm run drift:monitor -- --json
 *
 * Exit: 0 = within thresholds, 1 = drift detected (fail CI/cron on purpose).
 *
 * Thresholds (optional env):
 *   DRIFT_MAX_PENDING_SYNC (default 500)
 *   DRIFT_MAX_FAILED_SYNC (default 100)
 *   DRIFT_MAX_DUPLICATE_EVENTS_24H (default 50)
 *   DRIFT_MAX_SYNC_RETRY_FAILED_24H (default 30)
 *   DRIFT_MAX_WEBHOOK_ERRORS_24H (default 20)
 *   DRIFT_SKIP_INTEGRITY_AUDIT=true — skip npm audit:integrity child (not recommended)
 */

require("../src/config/env");
const prisma = require("../src/config/prisma");
const { spawnSync } = require("child_process");
const path = require("path");

const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

function num(v, d) {
  const n = Number.parseInt(String(v || ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

async function runIntegrityAudit() {
  if (process.env.DRIFT_SKIP_INTEGRITY_AUDIT === "true") {
    return { skipped: true, ok: true };
  }
  const script = path.join(__dirname, "auditFinancialIntegrity.js");
  const backendRoot = path.join(__dirname, "..");
  const r = spawnSync(process.execPath, [script], {
    cwd: backendRoot,
    encoding: "utf8",
    env: process.env,
  });
  const ok = r.status === 0;
  return {
    skipped: false,
    ok,
    exitCode: r.status,
    stdout: (r.stdout || "").slice(-4000),
    stderr: (r.stderr || "").slice(-4000),
  };
}

async function main() {
  const jsonOut = process.argv.includes("--json");

  const maxPending = num(process.env.DRIFT_MAX_PENDING_SYNC, 500);
  const maxFailed = num(process.env.DRIFT_MAX_FAILED_SYNC, 100);
  const maxDup = num(process.env.DRIFT_MAX_DUPLICATE_EVENTS_24H, 50);
  const maxRetryFail = num(process.env.DRIFT_MAX_SYNC_RETRY_FAILED_24H, 30);
  const maxWhErr = num(process.env.DRIFT_MAX_WEBHOOK_ERRORS_24H, 20);

  const [integrity, pending, failed, dup24, retryFail24, whErr24] = await Promise.all([
    runIntegrityAudit(),
    prisma.transaction.count({ where: { syncStatus: "PENDING" } }),
    prisma.transaction.count({ where: { syncStatus: "FAILED" } }),
    prisma.auditLog.count({
      where: { action: "SYNC_DUPLICATE_TRANSACTION", createdAt: { gte: since24h } },
    }),
    prisma.auditLog.count({
      where: { action: "SYNC_RETRY_FAILED", createdAt: { gte: since24h } },
    }),
    prisma.billingWebhookEvent.count({
      where: { outcome: "ERROR", createdAt: { gte: since24h } },
    }),
  ]);

  const checks = {
    integrityAudit: {
      ok: integrity.skipped ? true : integrity.ok,
      skipped: Boolean(integrity.skipped),
      detail: integrity.skipped ? null : { exitCode: integrity.exitCode },
    },
    syncBacklog: {
      pending,
      failed,
      ok: pending <= maxPending && failed <= maxFailed,
      thresholds: { maxPending, maxFailed },
    },
    idempotencySignals: {
      duplicateTransactionEvents24h: dup24,
      syncRetryFailed24h: retryFail24,
      ok: dup24 <= maxDup && retryFail24 <= maxRetryFail,
      thresholds: { maxDup, maxRetryFail },
    },
    billingWebhooks: {
      errors24h: whErr24,
      ok: whErr24 <= maxWhErr,
      thresholds: { maxWhErr },
    },
    window: { since24h: since24h.toISOString() },
  };

  const failedChecks = [];
  if (!checks.integrityAudit.ok) failedChecks.push("integrityAudit");
  if (!checks.syncBacklog.ok) failedChecks.push("syncBacklog");
  if (!checks.idempotencySignals.ok) failedChecks.push("idempotencySignals");
  if (!checks.billingWebhooks.ok) failedChecks.push("billingWebhooks");

  const report = {
    ok: failedChecks.length === 0,
    failedChecks,
    checks,
    generatedAt: new Date().toISOString(),
  };

  if (jsonOut) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log("[drift-monitor]", report.ok ? "OK" : "DRIFT DETECTED");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(checks, null, 2));
    if (failedChecks.length) {
      // eslint-disable-next-line no-console
      console.error("[drift-monitor] Failed gates:", failedChecks.join(", "));
    }
  }

  await prisma.$disconnect();

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[drift-monitor] Fatal:", err);
  process.exit(1);
});
