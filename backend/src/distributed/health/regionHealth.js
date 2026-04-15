/**
 * Phase 8.7 — process-local region health (DB reachability for this deployment).
 */
const prisma = require("../../config/prisma");
const { deploymentRegionId } = require("../../config/env");

function degradedLatencyThresholdMs() {
  const n = Number(process.env.REGION_HEALTH_DEGRADED_LATENCY_MS);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

/**
 * @param {string} regionId
 * @returns {Promise<{
 *   regionId: string,
 *   status: 'healthy' | 'degraded' | 'down' | 'unknown',
 *   latencyMs: number | null,
 *   lastHeartbeat: string,
 *   note?: string
 * }>}
 */
async function getRegionHealth(regionId) {
  const rid = String(regionId || "").trim() || deploymentRegionId;
  const lastHeartbeat = new Date().toISOString();

  if (rid !== deploymentRegionId) {
    return {
      regionId: rid,
      status: "unknown",
      latencyMs: null,
      lastHeartbeat,
      note: "not_local_deployment",
    };
  }

  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - t0;
    const threshold = degradedLatencyThresholdMs();
    return {
      regionId: rid,
      status: latencyMs > threshold ? "degraded" : "healthy",
      latencyMs,
      lastHeartbeat,
    };
  } catch {
    return {
      regionId: rid,
      status: "down",
      latencyMs: null,
      lastHeartbeat,
    };
  }
}

/**
 * Convenience: health for the running process's region (dashboards / readiness).
 */
function getLocalRegionHealth() {
  return getRegionHealth(deploymentRegionId);
}

module.exports = {
  getRegionHealth,
  getLocalRegionHealth,
  degradedLatencyThresholdMs,
};
