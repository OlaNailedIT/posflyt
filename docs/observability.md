# Observability Baseline

## Stack

- Backend error/event capture: Sentry (`@sentry/node`)
- Frontend error/event capture: Sentry (`@sentry/react`)
- Structured backend logs: Pino + `pino-http`
- Uptime monitoring: Better Uptime or UptimeRobot (API + frontend checks)

## Required Tags and Correlation

Every captured error should include:

- `environment` (`staging`, `production`)
- `release` (for deployment correlation)
- `request_id` (from `x-request-id`)
- error code and location when available

## Backend Logging Standard

All error logs should include:

- `status`
- `code`
- `message`
- `location`
- `requestId`

## Uptime Monitors

Configure monitors for:

1. `GET /health`
2. `GET /system/health`
3. Frontend availability URL

Alerting target:

- Detection latency under 2 minutes.

## Controlled Verification Playbook

1. Trigger a controlled backend error in staging.
2. Confirm Sentry event includes environment, release, and request ID.
3. Trigger a controlled health endpoint failure.
4. Confirm uptime alert delivery path and acknowledge timing.

## Phase 7.1 — Runtime metrics and trace sampling

### Prometheus (`GET /metrics`)

- **Off by default.** Set `METRICS_ENABLED=true` to expose Prometheus text metrics at `GET /metrics`.
- Optional **`METRICS_BEARER_TOKEN`**: when set, scrapers must send `Authorization: Bearer <token>`.
- The route is registered **before** global API rate limits so monitors do not consume the public quota.
- Metrics include process uptime, heap use, HTTP request counts by coarse `route_group`, duration histograms, 5xx counter, and sync retry resolution stats (see `backend/src/services/runtimeMetricsService.js`).

### Sentry performance traces

- Set **`SENTRY_TRACES_SAMPLE_RATE`** between `0` and `1` (e.g. `0.1` for 10% of transactions) when `SENTRY_DSN` is configured. Start low in production to control volume.

### Reliability JSON

- `GET /system/reliability-summary` (authenticated) continues to include `api5xxCount` and related fields; runtime metrics also expose `httpRequestCountTotal`, `uptimeSeconds`, and `processHeapUsedBytes` where applicable.

### Phase 7.3 — Slow requests

- Counter `posflyt_http_slow_requests_total` increments when a request’s observed duration is **≥ 1 second** (same signal in JSON as `httpSlowRequestsTotal`). Use for SLO / alerting.

### Phase 7.5 — Alerting alignment and saturation

- **`req.log`**: Pino child logger with `requestId` on each line for log correlation.
- **Gauge `posflyt_node_event_loop_delay_mean_seconds`**: mean event-loop delay over the last **5s** sample (saturation / “golden signal”). See [`phase-7.5-monitoring-alerting.md`](./phase-7.5-monitoring-alerting.md) for example alert rules and PromQL.
