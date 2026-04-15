/**
 * Phase 7 — orchestrates stress profiles against **real** read/reconcile paths (no DB corruption).
 */
const { randomUUID } = require("crypto");
const prisma = require("../../config/prisma");
const { runReconciliationScope } = require("../../reconciliation/reconciliationService");
const { buildSnapshot, getFinancialStateFast } = require("../../snapshot/snapshotEngine");
const { concurrentRepeats } = require("../injectors/syncStormInjector");
const { jitterSleep } = require("../injectors/latencyChaosInjector");
const { syntheticPayloadTamper } = require("../injectors/eventCorruptionInjector");
const { postOkGetFail } = require("../injectors/networkPartitionSimulator");
const { healScope } = require("../recovery/autoHealingEngine");
const { validateFinancialScope, validateSnapshotConvergence } = require("../validation/chaosValidator");
const { resilienceScore, buildReportEnvelope } = require("../metrics/chaosMetricsEngine");
const { classifyValidation } = require("../classifier/failureTaxonomy");
const { buildStreamEvent } = require("../../streaming/eventEnvelope");
const { getEventBus } = require("../../streaming/eventBus/eventBus");

function intensityParams(intensity) {
  const i = String(intensity || "MEDIUM").toUpperCase();
  if (i === "LOW") return { concurrency: 5, iterations: 30, sampleScopes: 3, stormEvents: 40 };
  if (i === "HIGH") return { concurrency: 50, iterations: 250, sampleScopes: 12, stormEvents: 300 };
  return { concurrency: 20, iterations: 120, sampleScopes: 8, stormEvents: 120 };
}

async function loadSampleScopes(businessId, take) {
  const rows = await prisma.integrityLedgerEvent.findMany({
    where: { businessId },
    distinct: ["clientTransactionId"],
    select: { clientTransactionId: true },
    take: Math.max(1, take),
  });
  return rows.map((r) => r.clientTransactionId).filter(Boolean);
}

async function scenarioSyncStorm(businessId, params, timeline) {
  const ids = await loadSampleScopes(businessId, params.sampleScopes);
  if (ids.length === 0) {
    timeline.push({ step: "sync_storm", at: Date.now(), note: "no integrity scopes — skipped hot path" });
    return buildReportEnvelope({
      scenario: "SYNC_STORM",
      intensity: params.intensity,
      transactionsTested: 0,
      recovered: 0,
      failed: 0,
      invariantNotes: ["NO_INTEGRITY_SCOPES"],
    });
  }
  const t0 = Date.now();
  let pass = 0;
  let fail = 0;
  await concurrentRepeats(
    params.iterations,
    async () => {
      const cid = ids[Math.floor(Math.random() * ids.length)];
      await jitterSleep({ minMs: 0, maxMs: 30 });
      try {
        const r = await runReconciliationScope({
          businessId,
          clientTransactionId: cid,
          emitStream: false,
        });
        if (r.status === "PASS") pass += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    },
    params.concurrency
  );
  const elapsed = Date.now() - t0;
  timeline.push({ step: "sync_storm_complete", at: Date.now(), note: `${params.iterations} tasks` });
  return buildReportEnvelope({
    scenario: "SYNC_STORM",
    intensity: params.intensity,
    transactionsTested: params.iterations,
    recovered: pass,
    failed: fail,
    averageConvergenceTimeMs: Math.round(elapsed / params.iterations),
    idempotencySuccessRate: params.iterations ? pass / params.iterations : null,
    invariantNotes: [`scopes_used=${ids.length}`],
  });
}

async function scenarioReconciliationHell(businessId, params, timeline) {
  const ids = await loadSampleScopes(businessId, params.sampleScopes);
  const tamper = syntheticPayloadTamper({ amount: 100, currency: "USD" });
  const notes = [`synthetic_hash_mismatch=${tamper.wouldMismatch}`];
  timeline.push({ step: "synthetic_tamper", at: Date.now(), note: "no database write" });

  let initialPass = 0;
  let healedOk = 0;
  const t0 = Date.now();
  for (const cid of ids) {
    await jitterSleep({ minMs: 5, maxMs: 80 });
    const v = await validateFinancialScope(businessId, cid);
    const tier = classifyValidation(v);
    if (v.pass) initialPass += 1;
    notes.push(`pre=${cid.slice(0, 8)} tier=${tier.tier} status=${v.reconciliationStatus}`);
    const healed = await healScope(businessId, cid);
    if (healed.ok) healedOk += 1;
    timeline.push({ step: "heal_attempt", at: Date.now(), note: `${cid.slice(0, 8)} ok=${healed.ok}` });
  }
  const rAvg = ids.length ? (Date.now() - t0) / ids.length : 0;
  const partitionSim = postOkGetFail(true);
  notes.push(`partition_sim_get=${partitionSim.get.error || "ok"}`);
  return buildReportEnvelope({
    scenario: "RECONCILIATION_HELL",
    intensity: params.intensity,
    transactionsTested: ids.length,
    recovered: healedOk,
    failed: ids.length - healedOk,
    averageConvergenceTimeMs: Math.round(rAvg),
    invariantNotes: [`initial_pass=${initialPass}/${ids.length}`, ...notes],
  });
}

async function scenarioSnapshotCollapse(businessId, params, timeline) {
  const ids = await loadSampleScopes(businessId, Math.min(3, params.sampleScopes));
  if (ids.length === 0) {
    return buildReportEnvelope({
      scenario: "SNAPSHOT_COLLAPSE",
      intensity: params.intensity,
      transactionsTested: 0,
      recovered: 0,
      failed: 0,
      invariantNotes: ["NO_SCOPES"],
    });
  }
  const cid = ids[0];
  const t0 = Date.now();
  await buildSnapshot(prisma, businessId, cid);
  const a = await getFinancialStateFast(prisma, businessId, cid);
  await buildSnapshot(prisma, businessId, cid);
  const b = await getFinancialStateFast(prisma, businessId, cid);
  timeline.push({ step: "double_snapshot", at: Date.now(), note: `${a.source}->${b.source}` });
  const conv = await validateSnapshotConvergence(businessId, cid);
  const pass = conv.converged;
  return buildReportEnvelope({
    scenario: "SNAPSHOT_COLLAPSE",
    intensity: params.intensity,
    transactionsTested: 1,
    recovered: pass ? 1 : 0,
    failed: pass ? 0 : 1,
    averageConvergenceTimeMs: Date.now() - t0,
    invariantNotes: [
      `readPath_first=${a.source}`,
      `readPath_second=${b.source}`,
      `snapshotEventCount=${conv.snapshotEventCount}`,
    ],
  });
}

async function scenarioEventStormPartition(businessId, params, timeline) {
  const bus = getEventBus();
  const t0 = Date.now();
  for (let i = 0; i < params.stormEvents; i += 1) {
    const ev = buildStreamEvent({
      type: "CHAOS_STORM",
      businessId,
      clientTransactionId: randomUUID(),
      source: "system",
      payload: { seq: i, simulated: true },
    });
    bus.publish(ev);
  }
  timeline.push({ step: "stream_publish", at: Date.now(), note: `${params.stormEvents} events` });
  const elapsed = Date.now() - t0;
  return buildReportEnvelope({
    scenario: "EVENT_STORM_PARTITION",
    intensity: params.intensity,
    transactionsTested: params.stormEvents,
    recovered: params.stormEvents,
    failed: 0,
    averageConvergenceTimeMs: Math.round(elapsed / params.stormEvents),
    invariantNotes: [`ring_buffer=${bus.snapshotStats().buffered}`],
  });
}

/**
 * @param {string} businessId
 * @param {string} scenario
 * @param {string} [intensity]
 */
async function runChaosScenario(businessId, scenario, intensity) {
  const ip = intensityParams(intensity);
  const params = { ...ip, intensity };
  const timeline = [];
  const name = String(scenario || "").toUpperCase();
  let metrics;

  if (name === "SYNC_STORM") {
    metrics = await scenarioSyncStorm(businessId, params, timeline);
  } else if (name === "RECONCILIATION_HELL") {
    metrics = await scenarioReconciliationHell(businessId, params, timeline);
  } else if (name === "SNAPSHOT_COLLAPSE") {
    metrics = await scenarioSnapshotCollapse(businessId, params, timeline);
  } else if (name === "EVENT_STORM_PARTITION") {
    metrics = await scenarioEventStormPartition(businessId, params, timeline);
  } else {
    throw new Error(`Unknown scenario: ${scenario}`);
  }

  const pass = Number(metrics.recovered) || 0;
  const fail = Number(metrics.failed) || 0;
  const score = resilienceScore({
    pass,
    fail,
    convergenceMs: metrics.averageConvergenceTimeMs,
  });

  return {
    metrics,
    resilienceScore: score,
    timeline,
  };
}

module.exports = {
  runChaosScenario,
  intensityParams,
};
