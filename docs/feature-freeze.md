# POSflyt Reliability Feature Freeze

Effective immediately, POSflyt is in reliability-first mode for pilot readiness.

## Freeze Policy

Until reliability gates pass, do not ship:

- AI or forecasting modules
- Additional analytics expansion
- New payment integrations
- Multi-country tax expansion
- Any feature not directly tied to sync reliability, inventory integrity, backend safety, or trust visibility

## Allowed Changes

- Bug fixes and reliability hardening
- Data integrity protections
- Structured logging and diagnostics
- UX clarity for system state (sync, failures, stale data)

## Gate to Exit Freeze

All of the following must hold for 7 consecutive days in staging/pilot:

- Duplicate transaction rate = 0
- Negative stock incidents = 0
- Eventual sync success >= 99%
- Unhandled crash from expected input = 0
