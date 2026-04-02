# POSflyt Reliability Test Matrix

## Required Scenarios

1. Flaky network oscillation (online/offline repeatedly)
2. Duplicate submit with same transaction ID
3. Concurrent offline sales on same low-stock SKU
4. Queue persistence after browser/app restart
5. Partial sync recovery (mixed success/failure)
6. Negative stock prevention under oversell attempts

## Test Template

- Scenario:
- Steps:
- Expected result:
- Actual result:
- Pass/Fail:
- Request ID / Logs:
- Notes:

## Reproducible Scripts (Staging)

- `npm --prefix backend run test:integration`
- `npm run test:e2e:smoke`

## Latest Run (2026-04-02)

- Flaky network oscillation (online/offline repeatedly)
  - Script: `npm run test:e2e:smoke` (`core loop sanity with sync visibility`)
  - Result: Pass
- Duplicate submit with same transaction ID
  - Script: `npm --prefix backend run test:integration` (`sync-reliability.integration.test.js`)
  - Result: Pass
- Concurrent offline sales on same low-stock SKU
  - Script: `npm --prefix backend run test:integration` (stock integrity assertions in sync reliability flow)
  - Result: Pass (no negative stock, one transaction rejected safely)
- Queue persistence after browser/app restart
  - Script: Manual QA scenario in pilot checklist (IndexedDB queue retained after reload/reopen)
  - Result: Pending manual staging run
- Partial sync recovery (mixed success/failure)
  - Script: `npm --prefix backend run test:integration` (207 partial sync cases)
  - Result: Pass
- Negative stock prevention under oversell attempts
  - Script: `npm --prefix backend run test:integration` (`sync-reliability.integration.test.js`)
  - Result: Pass

- Trust Center visibility + sync recovery guidance
  - Script: `npm run test:e2e:smoke` (dashboard/admin role scenarios)
  - Result: Pass
- Daily close admin flow
  - Script: `npm --prefix backend run test:integration` (`settings-admin.integration.test.js`)
  - Result: Pass
