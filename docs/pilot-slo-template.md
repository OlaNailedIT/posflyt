# POSflyt Pilot SLO Template

## Weekly Control Scorecard (C/F/B)

- Control (C): baseline `~3` -> current `_____` -> target `~5`
- Feature reliability (F): current `_____`
- Business-operational fit (B): current `_____`
- Composite OSS: baseline `~5.6` -> current `_____` -> target `~6.2+`

## Reliability SLO Targets

- Duplicate transaction rate: `0`
- Negative stock incidents: `0`
- Eventual sync success within retry window: `>= 99%`
- Unhandled backend crashes from expected input: `0`

## Ops KPI Targets (Weekly)

- CI pass rate: `>= 95%`
- Failed deploy rollback time: `< 10 min`
- Alert detection latency: `< 2 min`
- MTA (mean time to acknowledge): `< 10 min`
- MTTR: `< 30 min`

## Weekly KPI Tracking

- Week of:
- CI pass rate:
- Rollback time:
- Alert detection latency:
- MTA:
- MTTR:
- Notes:

## 48-Hour Activation Snapshot (2026-04-02)

- CI pass rate: `Local verification 100%` (live GitHub release cycle pending)
- Rollback time: `Not measured in live environment yet`
- Alert detection latency: `Not measured in live alerting stack yet`
- MTA: `Simulated drill values available, live verification pending`
- MTTR: `Simulated drill values available, live verification pending`
- Status: `Amber overall - operational activation blocked by missing git/gh/external service wiring`

## Daily Reporting

- Date:
- Environment:
- Sync success rate:
- Duplicate transaction rate:
- Stock mismatch count:
- API 5xx count:
- Avg sync retry resolution time (ms):
- Open reliability incidents:
- Notes:

## Deferred Feature Gate Checklist

Only unhide deferred features if ALL are true for 14 consecutive days:

- Duplicate transaction rate remains `0`
- Negative stock incidents remain `0`
- Eventual sync success remains `>= 99%`
- No unhandled backend crashes from expected input
- Reconciliation warning/critical trend is stable or improving

## Public Reliability Message

- "Never lose a sale. Never guess your stock. Even when internet fails."
