/**
 * Phase 7 — chaos control plane (explicitly env-gated; admin-only).
 */
const { z } = require("zod");
const { randomUUID } = require("crypto");
const { sendOk, sendError } = require("../utils/http");
const { isChaosEngineAllowed } = require("../chaos/chaosGuard");
const { runChaosScenario } = require("../chaos/scenarios/chaosScenarioRunner");
const { saveRun, getRun } = require("../chaos/runStore");
const { sleepMs } = require("../chaos/injectors/latencyChaosInjector");

const runBodySchema = z.object({
  scenario: z.enum([
    "SYNC_STORM",
    "RECONCILIATION_HELL",
    "SNAPSHOT_COLLAPSE",
    "EVENT_STORM_PARTITION",
  ]),
  intensity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

const injectBodySchema = z.object({
  kind: z.enum(["sleep"]),
  ms: z.number().min(0).max(5000),
});

function chaosForbidden(req) {
  return {
    statusCode: 403,
    code: "CHAOS_DISABLED",
    message:
      "Chaos engine disabled. Set CHAOS_ENGINE_ENABLED=true (and in production CHAOS_ENGINE_ALLOW_PRODUCTION=true).",
    location: "chaosController",
    details: { requestId: req.requestId },
  };
}

async function postChaosRun(req, res, next) {
  if (!isChaosEngineAllowed()) {
    return sendError(res, chaosForbidden(req));
  }
  try {
    const body = runBodySchema.parse(req.body);
    const businessId = req.auth.businessId;
    const runId = randomUUID();
    const startedAt = Date.now();
    const { metrics, resilienceScore: score, timeline } = await runChaosScenario(
      businessId,
      body.scenario,
      body.intensity
    );
    const report = saveRun({
      runId,
      businessId,
      scenario: body.scenario,
      intensity: body.intensity || "MEDIUM",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      metrics,
      resilienceScore: score,
      timeline,
      invariantSummary: {
        recovered: metrics.recovered,
        failed: metrics.failed,
        transactionsTested: metrics.transactionsTested,
      },
    });
    return sendOk(res, report);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "chaosController.postChaosRun",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function getChaosReport(req, res, next) {
  if (!isChaosEngineAllowed()) {
    return sendError(res, chaosForbidden(req));
  }
  try {
    const runId = String(req.params.runId || "").trim();
    if (!runId) {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "runId required",
        location: "chaosController.getChaosReport",
        details: { requestId: req.requestId },
      });
    }
    const report = getRun(runId);
    if (!report) {
      return sendError(res, {
        statusCode: 404,
        code: "CHAOS_REPORT_NOT_FOUND",
        message: "Unknown chaos run id (reports are kept in-memory, last 50).",
        location: "chaosController.getChaosReport",
        details: { requestId: req.requestId, runId },
      });
    }
    if (report.businessId !== req.auth.businessId) {
      return sendError(res, {
        statusCode: 403,
        code: "TENANT_MISMATCH",
        message: "Report belongs to another business",
        location: "chaosController.getChaosReport",
        details: { requestId: req.requestId },
      });
    }
    return sendOk(res, report);
  } catch (err) {
    return next(err);
  }
}

async function postChaosInject(req, res, next) {
  if (!isChaosEngineAllowed()) {
    return sendError(res, chaosForbidden(req));
  }
  try {
    const body = injectBodySchema.parse(req.body);
    if (body.kind === "sleep") {
      await sleepMs(body.ms);
    }
    return sendOk(res, { ok: true, kind: body.kind, appliedMs: body.kind === "sleep" ? body.ms : 0 });
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "chaosController.postChaosInject",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = {
  postChaosRun,
  getChaosReport,
  postChaosInject,
};
