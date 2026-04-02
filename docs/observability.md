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
