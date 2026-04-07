# ADR 002: Authentication — JWT and session tokens (MVP)

## Status

Accepted (MVP)

## Context

The backlog mentions short-lived access tokens + httpOnly refresh cookies. POSflyt currently uses a **simpler** model suitable for a small team and faster MVP delivery.

## Decision (current)

1. **Access token:** JWT signed with `JWT_SECRET`, default expiry **7 days** (see `signAuthToken` in `authService`).  
2. **Session row:** `ActiveSession` stores `tokenJti` (JWT `jti` claim) so sessions can be revoked or audited later.  
3. **Transport:** `Authorization: Bearer <token>` on API requests; Zustand persist + `auth_token` mirror in localStorage on the client for resilience after reload.  
4. **No httpOnly refresh cookie** in MVP — reduces cookie/CORS complexity on split domains (Vercel + Render).

## Consequences

- Stolen token valid until expiry unless revocation is implemented.  
- **Future:** introduce refresh tokens + rotation behind feature flag; keep this ADR updated.

## Links

- `backend/src/services/authService.js`, `backend/src/utils/jwt.js`, `src/services/api.js` interceptors.
