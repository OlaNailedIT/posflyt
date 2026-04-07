# Phase 7.4 — Scalability, high availability, and resilience

This document maps the Phase 7.4 strategic imperatives to **what the POSflyt codebase already supports**, what **operators configure** on the hosting platform (Neon, Render, Vercel, DNS/CDN), and **future** work if you outgrow the current architecture.

## Application layer (7.4.1)

### Stateless design and session affinity

- **API state:** Business logic does not rely on in-memory user session state. Authentication uses **JWT access tokens** and **refresh tokens** stored in Postgres (`Session` / related models), so any instance can validate requests.
- **Scaling:** Run **multiple backend instances** behind a load balancer; no sticky sessions are required for correctness.
- **Configuration:** Set `TRUST_PROXY=1` (or the number of proxy hops) when the API sits behind a reverse proxy or load balancer so **rate limiting** and **logs** use the real client IP from `X-Forwarded-For`. See [`deployment-production.md`](./deployment-production.md).

### Load balancing and auto-scaling

- **Health:** Use **`GET /health`** for uptime checks. It returns **503** if the database is unreachable, which is appropriate for **readiness** and for removing unhealthy instances from a pool.
- **Platform:** On Render (or similar), enable **multiple instances** and **auto-scaling** per host rules (CPU, request rate, etc.). The app does not need code changes for basic horizontal scaling.
- **Queues / workers:** Heavy async work (e.g. large exports, bulk notifications) can be extended with a **message queue** and dedicated workers in a later phase; the current MVP runs most work in-process.

## Database (7.4.2)

### Read replicas and connection management

- **Neon:** Supports **read replicas** and branching. The app currently uses a **single** `DATABASE_URL` (primary). To route reads to replicas you would introduce a **read URL** (e.g. `DATABASE_URL_READ`) and use it in Prisma or raw queries for read-only paths—**not implemented by default**; evaluate when read load dominates.
- **Pooling:** Production guidance uses Neon’s **pooler** URL and Prisma-friendly parameters (`sslmode=require`, `pgbouncer=true`, connection limits). See [`deployment-production.md`](./deployment-production.md).

### Sharding and HA

- **Sharding:** Not implemented in the schema; treat as a **future** step if a single Postgres instance becomes a hard limit.
- **Neon / managed Postgres:** **Automated failover** and **multi-AZ** behavior are **platform** concerns—enable and monitor in the Neon (or provider) console.

## Infrastructure and network (7.4.3)

- **Multi-AZ:** Use the provider’s defaults for **regional** Postgres and **stateless** app instances across multiple availability zones where offered.
- **CDN / edge:** The SPA on Vercel (or similar) benefits from **global static asset delivery**; API responses are typically **dynamic** and not cached by CDN unless you add explicit caching rules.
- **API gateway / throttling:** The **Express** layer applies **rate limits** (`express-rate-limit` on API and auth routes). A **dedicated API gateway** (e.g. AWS API Gateway, Cloudflare) can add **WAF**, **global throttling**, and **IP allowlists**—optional at the edge.

## Disaster recovery and continuity (7.4.4)

- **RTO / RPO:** Define **Recovery Time Objective** and **Recovery Point Objective** per environment; document targets and playbooks in [`phase-7.6-disaster-recovery-bc.md`](./phase-7.6-disaster-recovery-bc.md) and the quick steps in [`mvp-runbook-raci.md`](./mvp-runbook-raci.md).
- **Backups:** Neon provides **automated backups** and **point-in-time recovery** (per plan). Confirm retention and restore drills in the console.
- **Multi-region:** **Active-passive** or **active-active** across regions is an **infrastructure and data replication** project; the codebase does not assume multi-region writes by default.

## Continuous operations (7.4.5)

- **Capacity:** Use **Phase 7.1** metrics (`GET /metrics` when enabled) and host dashboards to watch latency, errors, and saturation.
- **Chaos / game days:** Schedule controlled failure tests (kill instance, simulate DB failover) in **staging** before production.

## Summary

| Imperative | In-repo / app | Platform / ops |
|------------|---------------|----------------|
| Stateless horizontal scaling | JWT + DB sessions; no sticky sessions | LB + multiple instances; `TRUST_PROXY` |
| Rate limiting & abuse protection | `express-rate-limit` | Optional WAF / API gateway |
| DB scale & HA | Neon + Prisma pooler URL | Replicas, failover, backups (Neon) |
| Monitoring & SLOs | `/metrics`, Sentry, structured logs | Alerts, dashboards |
| DR & multi-region | Backup/restore flows | RTO/RPO, replication, runbooks |

---

*Conclusion:* Phase 7.4 is largely **operational maturity** plus **platform** choices. The codebase is aligned with **stateless scaling** and **correct client IP behind proxies**; **read replicas**, **queues**, and **multi-region** are **incremental** steps when metrics justify them.
