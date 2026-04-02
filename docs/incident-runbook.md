# POSflyt Incident Runbook

## 1. Sync Incident

### Symptoms

- Pending queue grows
- Failed sync count increases
- Users report sales not appearing

### Immediate Actions

1. Check `/system/health`.
2. Check `/system/reliability-summary` (admin).
3. Inspect audit logs for:
   - `SYNC_INVENTORY_CONFLICT`
   - `SYNC_DUPLICATE_TRANSACTION`
4. Trigger manual sync and observe request IDs.

### Resolution

- If conflicts: resolve stock discrepancies first, then retry.
- If transient failures: confirm API/database status and allow retries.

## 2. Stock Mismatch Incident

### Symptoms

- Inventory differs from expected levels
- `INVENTORY_MISMATCH_DETECTED` in audit logs

### Immediate Actions

1. Identify affected business/product IDs from logs.
2. Review recent transactions and conflict events.
3. Confirm no negative stock exists.

### Resolution

- Correct stock if needed.
- Re-run reconciliation check.
- Document root cause in reliability changelog.

## 3. API Outage / Crash Risk

### Symptoms

- Increased API 5xx
- Request failures across endpoints

### Immediate Actions

1. Check recent error logs with `x-request-id`.
2. Verify database reachability.
3. Validate latest deploy touched only allowed reliability scope.

### Resolution

- Roll back faulty change if needed.
- Patch and redeploy.
- Record incident, impact, and prevention actions.

## 4. Staff Access Incident

### Symptoms

- Staff account should be blocked but still attempts to access
- Unauthorized access concerns from business admin

### Immediate Actions

1. Disable staff account via admin staff controls.
2. Confirm active sessions were revoked (`AUTH_LOGOUT_ALL` / `STAFF_DISABLED` logs).
3. Verify login with old password is rejected.

### Resolution

- If access was legitimate, reactivate with a new password only.
- Review audit trail:
  - `STAFF_DISABLED`
  - `STAFF_REACTIVATED`

## 5. Daily Close Not Completed

### Symptoms

- Day remains open in admin daily close section
- Totals not confirmed by manager/admin

### Immediate Actions

1. Open dashboard daily close checklist.
2. Review transaction count and total revenue.
3. Check variance flags (sync failures/inventory conflicts).

### Resolution

- Resolve outstanding sync/inventory issues if present.
- Confirm daily close as admin.
- Verify `DAILY_CLOSE_CONFIRMED` in audit logs.

## 6. Bad Deploy / Rollback

### Symptoms

- Elevated errors immediately after release
- Health checks fail after deployment
- Critical flow regressions in smoke paths

### Immediate Actions

1. Identify current production release tag.
2. Select last known-good release tag.
3. Trigger rollback workflow:
   - `deploy-production.yml`
   - `action=rollback`
   - `target_release=<known-good-tag>`

### Recovery Target

- Rollback complete within 10 minutes.

### Resolution Validation

1. Verify `GET /health` returns success.
2. Verify `GET /system/health` returns success.
3. Verify smoke path sanity for login and transaction flow.
4. Record timing and root cause in drill/incident docs.
