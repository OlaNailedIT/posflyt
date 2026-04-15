# UFEC Phase 2 — Legacy deprecation & dominance (Step 7)

This document is the **architecture contract** for financial behavior after Phase 2. It does **not** remove server-side validation (security and integrity remain). It **does** define where **product-facing correctness authority** lives.

## Authority model

| Layer | Role |
|--------|------|
| **UFEC (client)** | Canonical **FinancialEvent** types, **single entry** `executeFinancialEvent`, **enforcement** (levels 0–3), **ledger expectation** vs API response, **RECONCILE_REQUIRED** outcomes. |
| **Legacy HTTP + services (backend)** | **LEGACY_ADAPTER_ONLY**: persist rows, enforce HTTP/schema/quota/subscription, run idempotent pipelines, inventory side effects, audit. **Not** the parallel “truth” for UFEC classification. |
| **Ledger (DB)** | **Observed** persistence; UFEC compares **expected** vs **actual** from API responses (shadow). |

## Rules (do not violate without updating UFEC first)

1. **Do not add new financial *product rules* in** `transactionService`, `returnService`, or ad-hoc sync logic. New rules belong in the UFEC pipeline first, then adapters implement persistence.
2. **Server validation** (Zod, payment state, stock checks) stays as **integrity and abuse prevention** — not a second competing “decision system” for the client; UFEC remains the unified client decision layer.
3. **Every financial operation** the app performs must be expressible as a **FinancialEvent** (`SALE_EVENT`, `RETURN_EVENT`, `ADJUSTMENT_EVENT`, or controlled `OTHER_SYNC` for non-core outbox work).
4. **Enforcement** is centralized in `src/financial/ufecEnforcement.js` + `ufecLedgerShadow.js` (client). Do not fork WARN/FLAG/BLOCK semantics in UI modules.

## Tagged zones (`LEGACY_ADAPTER_ONLY`)

- `backend/src/services/transactionService.js` — sale creation, bulk, inventory decrement as part of execution.
- `backend/src/services/returnService.js` — return pipeline, ledger writes, inventory restore.
- Inventory mutations tied to sale/return completion in those services — **execution effects**, not UFEC substitutes.

## Optional dev marker (backend)

Set `UFEC_LEGACY_ADAPTER_ZONE_LOG=1` (non-production) to log once per process that legacy adapter modules loaded. Does not change behavior.

## Phase 3+ (not in scope here)

Distributed event persistence, immutable audit ledger, automated reconciliation, multi-node consistency — see roadmap when implemented.
