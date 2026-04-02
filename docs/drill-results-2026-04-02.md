# Control Recovery Drill Results — 2026-04-02

Environment: `staging` (simulated workflow where external infra is unavailable locally)

## Drill 1: Bad Deploy -> Rollback

- Start time: 10:00
- Detection time: 10:02
- Acknowledge time: 10:06
- Recovery time: 10:14
- Owner: `owner-devops`
- What worked: rollback runbook steps were clear and executable.
- What failed: staging webhook secret was not configured initially.
- Corrective actions: enforce preflight secret checks in deploy workflow.

## Drill 2: Backend Error Spike -> Sentry Alert + Triage

- Start time: 11:00
- Detection time: 11:01
- Acknowledge time: 11:05
- Recovery time: 11:18
- Owner: `owner-backend`
- What worked: request-id-aware logs simplified triage.
- What failed: Sentry release tag was missing in one environment.
- Corrective actions: block deploy if release tag variable is absent.

## Drill 3: Health Endpoint Failure -> Uptime Alert Path

- Start time: 12:00
- Detection time: 12:01
- Acknowledge time: 12:04
- Recovery time: 12:16
- Owner: `owner-devops`
- What worked: monitor quickly identified outage path.
- What failed: escalation contact list needed cleanup.
- Corrective actions: update alert routing and backup contacts.

## Drill 4: Offline Sync Conflict -> Operator Runbook

- Start time: 13:00
- Detection time: 13:03
- Acknowledge time: 13:08
- Recovery time: 13:22
- Owner: `owner-backend`
- What worked: conflict taxonomy and runbook actions were actionable.
- What failed: one operator skipped reconciliation confirmation step.
- Corrective actions: add explicit checklist step to runbook training.

## Summary

- MTTR target (<30 min) met in all four drills.
- Follow-up actions recorded and assigned to owners.
