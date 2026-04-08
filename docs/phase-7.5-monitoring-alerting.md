# Phase 7.5 — Monitoring, alerting, and operational intelligence

This document maps the Phase 7.5 imperatives to **what POSflyt implements in code** versus **what you configure** in Prometheus/Grafana, Sentry, log aggregation, and incident tools (PagerDuty, Opsgenie, Slack).

## 7.5.1 Metrics and logging — in-repo baseline

### Golden signals (backend)

| Signal | Metric / source | Notes |
|--------|-----------------|--------|
| **Latency** | `posflyt_http_request_duration_seconds` (histogram) | Per `method` + `route_group` (low cardinality). |
| **Traffic** | `posflyt_http_requests_total` | Labels: `method`, `status_class`, `route_group`. |
| **Errors** | `posflyt_http_requests_total{status_class="5xx"}` and `posflyt_api_5xx_total` | Prefer `sum by (...) (rate(...))` on `http_requests_total` for SLOs; slow requests: `posflyt_http_slow_requests_total`. |
| **Saturation** | `posflyt_process_heap_bytes`, **`posflyt_node_event_loop_delay_mean_seconds`**, `posflyt_process_uptime_seconds` | Event-loop delay is sampled every 5s (Node `perf_hooks.monitorEventLoopDelay`). High lag + rising latency suggests CPU-bound work or blocking I/O. |

Enable scraping with **`METRICS_ENABLED=true`** and optional **`METRICS_BEARER_TOKEN`** (see [`observability.md`](./observability.md)).

### Business-oriented signals

- **Reliability summary** (`GET /system/reliability-summary`, authenticated): sync success rates, mismatch counts, `api5xxCount`, **`eventLoopDelayMeanSeconds`**, reconciliation trends.
- **Sync retries**: `posflyt_sync_retry_resolutions_total` and related counters (see `runtimeMetricsService.js`).

### Structured logging

- **Pino** JSON logs; default level **`info`** in production, **`debug`** in development (`LOG_LEVEL` overrides).
- **`req.log`**: child logger with `requestId` on every line for correlation (Phase 7.5). Use `req.log` in new handlers; `requestId` propagates to `x-request-id` response header.
- **API errors** (`errorHandler`): `event`, `code`, `route`, `userId`, `businessId` when auth present.
- **Sentry**: tags include `requestId` where applicable; tune `SENTRY_TRACES_SAMPLE_RATE` to control trace volume.

### Log level discipline

| Level | Use |
|-------|-----|
| `debug` | Short-lived troubleshooting (avoid sustained `debug` in prod). |
| `info` | Normal lifecycle (startup, request start/complete when enabled). |
| `warn` | Recoverable issues, 4xx/expected conflicts. |
| `error` | 5xx and unhandled failures. |

---

## 7.5.2 Intelligent alerting — platform configuration

POSflyt does **not** run an alert manager inside the repo. Define rules in **Grafana Alerting**, **Prometheus Alertmanager**, or your host’s **observability product**, using **historical baselines** and **SLOs**.

### Example PromQL (illustrative — tune windows)

| Goal | Example expression |
|------|----------------------|
| High 5xx rate | `sum(rate(posflyt_http_requests_total{status_class="5xx"}[5m])) / sum(rate(posflyt_http_requests_total[5m])) > 0.05` |
| Slow requests | `rate(posflyt_http_slow_requests_total[5m]) > 0.5` |
| Event-loop saturation | `posflyt_node_event_loop_delay_mean_seconds > 0.5` (tune threshold) |
| DB / health | Uptime monitor on **`GET /health`** → 503 or timeout |

### Alert design principles

- **Severity**: map Critical → paging; High → Slack + on-call; Medium/Low → ticket backlog.
- **Dedup**: one alert per incident (e.g. “5xx error budget burn” vs one email per 500).
- **Message body**: service name, threshold, current value, link to Grafana dashboard, link to [`mvp-runbook-raci.md`](./mvp-runbook-raci.md).

### Anomaly / ML

Use **managed** anomaly detection (Grafana Cloud, Datadog, etc.) on golden-signal dashboards; no custom ML in the application runtime.

---

## 7.5.3 Incident response — integrations

| Capability | How |
|------------|-----|
| **Webhook → incident** | Configure Alertmanager → PagerDuty/Opsgenie/Jira SM; include `requestId` from logs in runbook. |
| **Runbook links** | Put stable URLs in alert annotations (Grafana, etc.). |
| **Self-healing** | Platform-level (instance restart, auto-scale); not embedded in Node for MVP. |

---

## 7.5.4 Continuous improvement

- **Review alerts**: monthly — drop noisy rules, fix thresholds from false positives.
- **Coverage audit**: ensure `/health`, 5xx rate, latency, and critical business flows (sync, billing webhooks) have dashboards.
- **RCA**: correlate Sentry issues, log lines by `requestId`, and Prometheus time ranges.

---

## Summary

| Imperative | In-repo | External |
|------------|---------|----------|
| KPIs & golden signals | Prometheus metrics + reliability JSON | Dashboards, SLOs |
| Structured logs | Pino + `req.log` + error fields | Log aggregation, queries |
| Alert fatigue | Low-cardinality labels | Threshold tuning, dedup, routing |
| Incident workflow | — | Webhooks, PagerDuty, runbooks |

---

*Conclusion:* Phase 7.5 completes the **observability loop** with **actionable metrics** (including event-loop saturation), **consistent request-scoped logging**, and **operator-run** alerting and incident tooling. See also [`phase-7.4-scalability-ha.md`](./phase-7.4-scalability-ha.md) for scaling and [`observability.md`](./observability.md) for the Phase 7.1 baseline.
