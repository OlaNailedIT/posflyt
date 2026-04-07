# Phase 7.6 — Disaster recovery and business continuity

This document maps Phase 7.6 imperatives to **POSflyt’s architecture** (Neon Postgres, Render-style API, Vercel SPA), **what is implemented in the repo**, and **what owners must define and operate** outside the application.

---

## 7.6.1 Recovery objectives (RTO and RPO)

Before buying tooling or regions, record **Recovery Time Objective** (max acceptable outage) and **Recovery Point Objective** (max acceptable data loss) per **environment** and **component**. Use these tables as a template; replace placeholders with business-approved numbers.

### Example RTO targets (fill in)

| Component | Criticality | Target RTO (example) | Notes |
|-----------|-------------|----------------------|--------|
| API + database (transactions, auth) | Highest | e.g. under 1 hour | Dominated by Neon restore + redeploy |
| Read-only reporting | Medium | e.g. under 4 hours | May lag primary |
| Marketing / static site | Lower | e.g. within 24 hours | Vercel redeploy |

### Example RPO targets (fill in)

| Dataset | Criticality | Target RPO (example) | How to meet it |
|---------|-------------|----------------------|----------------|
| Postgres (authoritative state) | Highest | e.g. 5 minutes to 1 hour | Neon **PITR** / backups (plan-dependent) |
| Application-level JSON exports | Supplemental | e.g. 6 h | In-app scheduler (see below); **not** a substitute for DB backups |
| Config / secrets | High | 0 (no drift) | Infra-as-code + secret manager |

**Business Impact Analysis (BIA):** tie each row to revenue, compliance, or reputation impact; revisit when traffic or regulation changes.

---

## 7.6.2 Backup and restoration

### Authoritative store: Neon (Postgres)

- **Automated backups and point-in-time recovery (PITR)** are **provider capabilities**. Configure retention, regions, and restore drills in the [Neon](https://neon.tech/docs) console for your plan.
- **Offsite / cross-region:** use Neon’s documented options for backup geography and failover; do not rely on a single laptop or one availability zone story without verifying the console.
- **Restore validation:** schedule **quarterly** (or per policy) a **non-production** restore from backup or branch-from-PITR, run `prisma migrate deploy` against a throwaway DB, and smoke-test `GET /health` and a critical API path.

### Application-level exports (supplementary)

The backend includes a **scheduled JSON export** of per-business data (`backupService`: products, customers, transactions, settings) under `backups/` on the host, with metadata in `BackupRecord`. This runs on an interval in non-test environments.

**Operational caveats:**

- On **ephemeral** hosts (containers without persistent volumes), files may **not survive** instance replacement—treat these exports as **convenience / secondary**, not primary DR.
- For durable exports, copy artifacts to **object storage** (S3-compatible, etc.) via a future pipeline or manual process.

### Configuration and logs

- **Secrets:** `DATABASE_URL`, `JWT_SECRET`, payment keys live in the host (Render, etc.); recovery means restoring **the same** secrets or rotating with a coordinated client re-login / token invalidation strategy.
- **Logs:** aggregate to a retained store (Phase 7.5); logs are not the system of record for transactions.

---

## 7.6.3 Multi-region and multi-cloud

| Pattern | POSflyt today | Typical next steps |
|---------|---------------|---------------------|
| **Single region** | Default for MVP stack | Acceptable if RTO/RPO met by Neon + redeploy |
| **Active–passive** | Not wired in code | Secondary region: cold/warm DB replica + DNS cutover (runbook) |
| **Active–active** | Not implemented | Requires conflict-aware writes, global routing; major product work |

**Global load balancing** and **cross-region replication** are **infrastructure and data-layer** projects; see also [`phase-7.4-scalability-ha.md`](./phase-7.4-scalability-ha.md).

---

## 7.6.4 Failover and failback

### Detection

- **`GET /health`** — returns **503** when Postgres is unreachable; use for LB and uptime monitors ([`deployment-production.md`](./deployment-production.md)).
- **Phase 7.5** — alerts on 5xx rate, slow requests, event-loop delay; route Critical alerts to on-call.

### Failover (typical playbook)

1. Confirm incident (provider status, Neon console, app logs with `requestId`).
2. If **DB**: use Neon failover / restore / branch procedures per runbook; update `DATABASE_URL` if the endpoint changes.
3. If **app host**: redeploy or scale; verify `CORS_ORIGIN`, `TRUST_PROXY`, and `migrate deploy` on boot.
4. If **frontend**: Vercel rollback or redeploy; confirm `VITE_API_URL` points to live API.

### Failback

- After primary region/service is healthy, **plan** a return: drain secondary, verify replication or data merge, then cut DNS/traffic with a maintenance window if needed.

---

## 7.6.5 DR testing and validation

| Activity | Suggested frequency | Success criteria |
|----------|---------------------|------------------|
| **Restore drill** (Neon → staging) | Quarterly | App connects; migrations apply; smoke tests pass |
| **Game day** (kill instance, simulate DB blip) | Semi-annually | Alerts fire; runbook steps complete; RTO within target |
| **Backup integrity** | Per release or quarterly | Checksum or row-count spot checks on restored DB |
| **Post-mortem** | After each drill | Update runbooks, thresholds, RACI |

Automated post-restore checks can extend CI or staging jobs over time; the MVP baseline is **documented manual verification**.

---

## 7.6.6 Business continuity and communication

| Artifact | Owner | Purpose |
|----------|--------|---------|
| **BIA / risk register** | Product + ops | Prioritize components and RTO/RPO |
| **Internal comms** | On-call | Channel, escalation, roles |
| **External comms** | Comms / support | Status page, customer email templates (pre-approved) |
| **Regulatory** | Legal / DPO | Retention, breach notification timelines |

Crisis roles should mirror your **incident response** process (Phase 7.5); DR adds **longer outage** and **data restore** scenarios.

---

## Summary

| Imperative | In-repo / app | Owner / platform |
|------------|---------------|------------------|
| Minimal data loss | Sync idempotency, transactional DB | Neon PITR, backups, RPO targets |
| Rapid recovery | Health route, `start:prod` + migrations | Runbooks, redeploy, restore drills |
| Multi-region | Stateless API (Phase 7.4) | DNS, DB replication, future active-passive |
| Compliance | Security docs (Phase 7.2), audit logs | Policies, DPA, region choice |
| Stakeholder confidence | Tested restores, clear RTO/RPO | Status comms, game days |

---

## Related documents

- [`mvp-runbook-raci.md`](./mvp-runbook-raci.md) — Quick recovery steps  
- [`deployment-production.md`](./deployment-production.md) — Env, health, scaling  
- [`phase-7.4-scalability-ha.md`](./phase-7.4-scalability-ha.md) — HA and scaling  
- [`phase-7.5-monitoring-alerting.md`](./phase-7.5-monitoring-alerting.md) — Alerts and incidents  

---

*Conclusion:* Phase 7.6 is satisfied for POSflyt by **explicit RTO/RPO**, **Neon-backed recovery** as the source of truth, **operational runbooks**, and **regular drills**—not by duplicating database failover logic inside Node.
