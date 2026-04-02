# Release Process

## Versioning

Production releases use: `vYYYY.MM.DD-N`.

Example: `v2026.04.02-17`

## Promotion Flow

1. Merge to `main` only after CI is green.
2. Staging deploy workflow runs and enforces health checks.
3. Validate smoke tests and staging sanity.
4. Manually trigger production deploy (`deploy-production.yml`, action=`deploy`).
5. Approve production environment gate.
6. Verify production `/health` and `/system/health`.
7. Run 30-minute post-release monitoring window.

## Rollback Flow (<10 minutes target)

1. Identify last known-good release tag.
2. Run `deploy-production.yml` with:
   - `action=rollback`
   - `target_release=<known-good-tag>`
3. Confirm production health endpoints recover.
4. Log incident summary and rollback timing in runbook.

## Definition of Done for Every Release

- CI green
- Staging deploy green + health checks pass
- Smoke tests pass
- No unresolved critical Sentry issues
- Manual production approval completed
- Rollback command/path verified
- Post-release 30-minute monitoring window complete

## Permanent Operating Checklist

- [ ] CI green
- [ ] Staging deploy green + health checks pass
- [ ] Smoke tests pass
- [ ] No unresolved critical Sentry issues
- [ ] Manual production approval completed
- [ ] Rollback command/path verified
- [ ] Post-release 30-minute monitoring window complete
