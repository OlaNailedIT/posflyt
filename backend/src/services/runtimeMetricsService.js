/**
 * In-process metrics for Phase 7.1 observability (Prometheus scrape + admin JSON).
 * Low-cardinality route groups only.
 */

const { monitorEventLoopDelay } = require("perf_hooks");

const HTTP_DURATION_BUCKETS_SEC = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const state = {
  api5xxCount: 0,
  /** Requests with total duration ≥ 1s (Phase 7.3 tuning signal). */
  httpSlowTotal: 0,
  startedAt: new Date().toISOString(),
  startedAtMs: Date.now(),
  syncRetryResolution: {
    resolvedCount: 0,
    totalResolutionMs: 0,
  },
  /** key: `${method}|${statusClass}|${routeGroup}` */
  httpRequestCounts: new Map(),
  /** key: `${method}|${routeGroup}` -> { sum, count, buckets: number[] } cumulative per bucket */
  httpDurationHist: new Map(),
  /** Golden signal: saturation — mean event-loop lag (seconds), last sample window (Phase 7.5). */
  eventLoopDelayMeanSeconds: 0,
  /** Billing / webhooks (Phase 7.1 hardening). */
  billing: {
    failedPaymentsCount: 0,
    retryAttemptsCount: 0,
    webhookFailuresCount: 0,
  },
};

const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram.enable();
const EVENT_LOOP_SAMPLE_MS = 5000;
const eventLoopTimer = setInterval(() => {
  state.eventLoopDelayMeanSeconds = eventLoopHistogram.mean / 1e9;
  eventLoopHistogram.reset();
}, EVENT_LOOP_SAMPLE_MS);
if (typeof eventLoopTimer.unref === "function") {
  eventLoopTimer.unref();
}

function statusClass(code) {
  const n = Number(code);
  if (n >= 500) return "5xx";
  if (n >= 400) return "4xx";
  if (n >= 300) return "3xx";
  return "2xx";
}

/**
 * Coarse route bucket for Prometheus labels (avoids high cardinality).
 * @param {string} path
 */
function routeGroupFromPath(path) {
  const p = String(path || "").split("?")[0];
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return "root";
  const first = parts[0];
  if (first === "health") return "health";
  if (first === "metrics") return "metrics";
  if (first === "auth") return "auth";
  if (first === "transactions") return "transactions";
  if (first === "products") return "products";
  if (first === "customers") return "customers";
  if (first === "billing") return "billing";
  if (first === "admin") return "admin";
  if (first === "settings" || first === "staff" || first === "system") return first;
  return "other";
}

function incrementApi5xx() {
  state.api5xxCount += 1;
}

function incrementBillingFailedPayments(delta = 1) {
  state.billing.failedPaymentsCount += delta;
}

function incrementBillingRetryAttempts(delta = 1) {
  state.billing.retryAttemptsCount += delta;
}

function incrementBillingWebhookFailures(delta = 1) {
  state.billing.webhookFailuresCount += delta;
}

function recordSyncRetryResolution(resolutionMs) {
  const value = Number(resolutionMs);
  if (!Number.isFinite(value) || value < 0) return;
  state.syncRetryResolution.resolvedCount += 1;
  state.syncRetryResolution.totalResolutionMs += value;
}

/**
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.originalUrl req.originalUrl or req.url
 * @param {number} opts.statusCode
 * @param {number} opts.durationSeconds wall-clock duration
 */
function recordHttpRequest({ method, originalUrl, statusCode, durationSeconds }) {
  const m = String(method || "GET").toUpperCase();
  const sc = statusClass(statusCode);
  const rg = routeGroupFromPath(originalUrl);
  const reqKey = `${m}|${sc}|${rg}`;
  state.httpRequestCounts.set(reqKey, (state.httpRequestCounts.get(reqKey) || 0) + 1);

  const dur = Number(durationSeconds);
  const safeDur = Number.isFinite(dur) && dur >= 0 ? dur : 0;

  const histKey = `${m}|${rg}`;
  let hist = state.httpDurationHist.get(histKey);
  if (!hist) {
    hist = {
      sum: 0,
      count: 0,
      /** cumulative counts per bucket index (same order as HTTP_DURATION_BUCKETS_SEC + Inf) */
      cumulative: new Array(HTTP_DURATION_BUCKETS_SEC.length + 1).fill(0),
    };
    state.httpDurationHist.set(histKey, hist);
  }
  hist.sum += safeDur;
  hist.count += 1;
  if (safeDur >= 1) {
    state.httpSlowTotal += 1;
  }
  for (let i = 0; i < HTTP_DURATION_BUCKETS_SEC.length; i += 1) {
    if (safeDur <= HTTP_DURATION_BUCKETS_SEC[i]) {
      hist.cumulative[i] += 1;
    }
  }
  hist.cumulative[HTTP_DURATION_BUCKETS_SEC.length] += 1;
}

function escapeLabelValue(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function getPrometheusMetricsText() {
  const lines = [];
  const mem = process.memoryUsage();

  lines.push("# HELP posflyt_process_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE posflyt_process_uptime_seconds gauge");
  lines.push(`posflyt_process_uptime_seconds ${process.uptime().toFixed(4)}`);

  lines.push("# HELP posflyt_process_heap_bytes V8 heap used bytes.");
  lines.push("# TYPE posflyt_process_heap_bytes gauge");
  lines.push(`posflyt_process_heap_bytes ${Math.round(mem.heapUsed)}`);

  lines.push(
    "# HELP posflyt_node_event_loop_delay_mean_seconds Mean Node.js event loop delay over the last sample window (saturation signal)."
  );
  lines.push("# TYPE posflyt_node_event_loop_delay_mean_seconds gauge");
  lines.push(`posflyt_node_event_loop_delay_mean_seconds ${state.eventLoopDelayMeanSeconds.toFixed(9)}`);

  lines.push("# HELP posflyt_api_5xx_total Total API responses with HTTP 5xx status.");
  lines.push("# TYPE posflyt_api_5xx_total counter");
  lines.push(`posflyt_api_5xx_total ${state.api5xxCount}`);

  lines.push("# HELP posflyt_http_slow_requests_total HTTP requests with wall-clock duration >= 1s.");
  lines.push("# TYPE posflyt_http_slow_requests_total counter");
  lines.push(`posflyt_http_slow_requests_total ${state.httpSlowTotal}`);

  lines.push("# HELP posflyt_http_requests_total HTTP requests by method, status class, and route group.");
  lines.push("# TYPE posflyt_http_requests_total counter");
  for (const [key, count] of state.httpRequestCounts.entries()) {
    const [method, sclass, route] = key.split("|");
    lines.push(
      `posflyt_http_requests_total{method="${escapeLabelValue(method)}",status_class="${escapeLabelValue(sclass)}",route_group="${escapeLabelValue(route)}"} ${count}`
    );
  }

  lines.push("# HELP posflyt_http_request_duration_seconds HTTP request duration histogram (seconds).");
  lines.push("# TYPE posflyt_http_request_duration_seconds histogram");
  for (const [key, hist] of state.httpDurationHist.entries()) {
    const [method, route] = key.split("|");
    const base = `posflyt_http_request_duration_seconds{method="${escapeLabelValue(method)}",route_group="${escapeLabelValue(route)}"`;
    for (let i = 0; i < HTTP_DURATION_BUCKETS_SEC.length; i += 1) {
      const le = HTTP_DURATION_BUCKETS_SEC[i];
      lines.push(`${base},le="${le}"} ${hist.cumulative[i]}`);
    }
    lines.push(`${base},le="+Inf"} ${hist.count}`);
    lines.push(`posflyt_http_request_duration_seconds_sum{method="${escapeLabelValue(method)}",route_group="${escapeLabelValue(route)}"} ${hist.sum.toFixed(6)}`);
    lines.push(`posflyt_http_request_duration_seconds_count{method="${escapeLabelValue(method)}",route_group="${escapeLabelValue(route)}"} ${hist.count}`);
  }

  const resolvedCount = state.syncRetryResolution.resolvedCount;
  const avgMs =
    resolvedCount > 0
      ? Number((state.syncRetryResolution.totalResolutionMs / resolvedCount).toFixed(2))
      : 0;

  lines.push("# HELP posflyt_sync_retry_resolutions_total Sync retry resolutions recorded.");
  lines.push("# TYPE posflyt_sync_retry_resolutions_total counter");
  lines.push(`posflyt_sync_retry_resolutions_total ${resolvedCount}`);

  lines.push("# HELP posflyt_sync_retry_resolution_duration_ms_sum Sum of sync retry resolution times (ms).");
  lines.push("# TYPE posflyt_sync_retry_resolution_duration_ms_sum counter");
  lines.push(`posflyt_sync_retry_resolution_duration_ms_sum ${state.syncRetryResolution.totalResolutionMs}`);

  lines.push("# HELP posflyt_sync_retry_resolution_duration_ms_avg Average sync retry resolution time (ms).");
  lines.push("# TYPE posflyt_sync_retry_resolution_duration_ms_avg gauge");
  lines.push(`posflyt_sync_retry_resolution_duration_ms_avg ${avgMs}`);

  lines.push("# HELP posflyt_process_start_time_seconds Unix timestamp (seconds) when the process started.");
  lines.push("# TYPE posflyt_process_start_time_seconds gauge");
  lines.push(`posflyt_process_start_time_seconds ${Math.floor(state.startedAtMs / 1000)}`);

  lines.push("# HELP posflyt_billing_failed_payments_total Payments marked failed (gateway or stale timeout).");
  lines.push("# TYPE posflyt_billing_failed_payments_total counter");
  lines.push(`posflyt_billing_failed_payments_total ${state.billing.failedPaymentsCount}`);

  lines.push("# HELP posflyt_billing_retry_attempts_total Payment retry worker attempts (per payment processed).");
  lines.push("# TYPE posflyt_billing_retry_attempts_total counter");
  lines.push(`posflyt_billing_retry_attempts_total ${state.billing.retryAttemptsCount}`);

  lines.push("# HELP posflyt_billing_webhook_failures_total Webhook signature verification failures.");
  lines.push("# TYPE posflyt_billing_webhook_failures_total counter");
  lines.push(`posflyt_billing_webhook_failures_total ${state.billing.webhookFailuresCount}`);

  return `${lines.join("\n")}\n`;
}

function getRuntimeMetrics() {
  const resolvedCount = state.syncRetryResolution.resolvedCount;
  const averageSyncRetryResolutionTimeMs =
    resolvedCount > 0
      ? Number((state.syncRetryResolution.totalResolutionMs / resolvedCount).toFixed(2))
      : null;

  let httpRequestCountTotal = 0;
  for (const v of state.httpRequestCounts.values()) {
    httpRequestCountTotal += v;
  }

  return {
    api5xxCount: state.api5xxCount,
    httpSlowRequestsTotal: state.httpSlowTotal,
    startedAt: state.startedAt,
    billing: { ...state.billing },
    syncRetryResolution: { ...state.syncRetryResolution },
    httpRequestCountTotal,
    uptimeSeconds: process.uptime(),
    processHeapUsedBytes: process.memoryUsage().heapUsed,
    averageSyncRetryResolutionTimeMs,
    eventLoopDelayMeanSeconds: state.eventLoopDelayMeanSeconds,
  };
}

module.exports = {
  incrementApi5xx,
  incrementBillingFailedPayments,
  incrementBillingRetryAttempts,
  incrementBillingWebhookFailures,
  recordSyncRetryResolution,
  recordHttpRequest,
  getRuntimeMetrics,
  getPrometheusMetricsText,
  routeGroupFromPath,
};
