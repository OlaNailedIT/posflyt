# POSflyt 7-Day Control Recovery Week

## Mission

Move POSflyt from a reliability-hardened application layer to a pilot-safe, operationally controlled system.

Primary targets:

- Raise Control (C) from ~3 to ~5.
- Raise composite OSS from ~5.6 to ~6.2+.

## Owners

- `owner-devops`: CI/CD, deployment gates, rollback, uptime monitoring, branch protection.
- `owner-backend`: backend observability, security boundary controls, health checks, runbooks.
- `owner-frontend`: frontend observability wiring, smoke-path validation, release confidence checks.

## Scope Freeze Rules (Week-Only)

Allowed:

- CI/CD workflows and deploy gates
- rollback and release process hardening
- observability and structured logging
- ops-side security baseline
- drill execution and postmortems

Not allowed:

- AI/forecasting expansion
- payment expansion
- multi-country tax complexity
- advanced analytics expansion
- unrelated product/UI feature work

## Release Gate Policy

Production deploy is blocked unless all are true:

1. CI workflow is green.
2. Smoke tests are green.
3. Staging deployment is successful.
4. `/health` and `/system/health` checks pass in staging.
5. Manual production approval is granted.

## Day-by-Day Plan

| Day | Phase | Goal | Deliverables |
| --- | --- | --- | --- |
| Day 0 | Prep | Ownership + freeze + hard gate | `docs/control-recovery-week.md` |
| Day 1 | CI Foundation | PR checks and merge gate policy | `.github/workflows/ci.yml`, README badge, branch protection doc |
| Day 2 | Staging Gate | Auto deploy staging and enforce post-deploy health checks | `.github/workflows/deploy-staging.yml`, `docs/environments.md` |
| Day 3 | Prod + Rollback | Manual approval, release tags, rollback process | `.github/workflows/deploy-production.yml`, `docs/release-process.md`, runbook update |
| Day 4 | Observability | Sentry + structured logs + request ID correlation | `docs/observability.md`, instrumentation changes |
| Day 5 | Security Baseline | login boundary hardening + secrets process | `docs/security-baseline.md` |
| Day 6 | Failure Drills | tabletop/live drill record and actions | `docs/drill-results-2026-04-02.md` |
| Day 7 | Gate Review | re-score C/F/B and lock release DoD | `docs/pilot-slo-template.md`, final review section |

## Risk Register (Starter)

| Risk | Impact | Mitigation | Owner |
| --- | --- | --- | --- |
| CI failures block all merges | Medium | Keep tests deterministic and fix flaky tests before merge windows | `owner-devops` |
| Staging/prod secret misconfiguration | High | Use env inventory + preflight checks in workflow | `owner-devops` |
| Alert noise reduces response quality | Medium | Tune thresholds and alert routing policy | `owner-backend` |
| Rollback path not validated recently | High | Run rollback drill weekly with timing capture | `owner-devops` |
| Scope creep during control week | Medium | Enforce freeze in PR template and review | All owners |

## Escalation Path

1. Incident owner acknowledges issue within 10 minutes.
2. If unresolved after 15 minutes, escalate to `owner-devops` and `owner-backend`.
3. If customer-impacting after 30 minutes, initiate rollback and post-incident review.
4. Log incident summary and corrective actions in runbook/docs before closure.

## Branch Protection Requirements

See `docs/branch-protection.md`. Required status checks must include:

- `Backend Unit Tests`
- `Backend Integration Tests`
- `Frontend Build`
- `Browser Smoke Tests`

## Final Weekly Control Review (Day 7)

- Control score (C): _TBD after week execution_
- Composite OSS: _TBD after week execution_
- Go/No-Go for pilot expansion: _TBD_
- Variance notes and follow-ups: _TBD_

## 48-Hour Activation Outcomes (2026-04-02)

- Local command gates (`npm test`, integration tests, frontend build, smoke tests): **PASS**
- GitHub branch protection verification: **BLOCKED** (workspace is not a git repo; `gh` unavailable)
- GitHub Actions live deploy-gate verification: **BLOCKED** (cannot trigger from local environment)
- Sentry live event verification: **BLOCKED** (external DSN/project setup pending)
- Uptime alert latency verification: **BLOCKED** (external monitor setup pending)
- Rollback timed live drill: **BLOCKED** (requires connected staging/production workflow execution)

Reference evidence: `docs/activation-evidence-2026-04-02.md`
