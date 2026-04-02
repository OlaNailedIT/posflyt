# Environments

## Staging

- Backend URL: `https://staging-api.posflyt.example`
- Frontend URL: `https://staging.posflyt.example`
- Health checks:
  - `GET /health`
  - `GET /system/health`
- Owner: `owner-devops`

## Production

- Backend URL: `https://api.posflyt.example`
- Frontend URL: `https://app.posflyt.example`
- Health checks:
  - `GET /health`
  - `GET /system/health`
- Owner: `owner-devops`

## Required Environment Variables

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `APP_BASE_URL`
- `CORS_ORIGIN`
- `LOG_LEVEL`
- `SENTRY_DSN`
- `SENTRY_RELEASE`
- `STRIPE_SECRET_KEY` (if billing paths are enabled)
- `STRIPE_WEBHOOK_SECRET` (if billing paths are enabled)
- `PAYSTACK_SECRET_KEY` (if billing paths are enabled)
- `PAYSTACK_WEBHOOK_SECRET` (if billing paths are enabled)

Frontend:

- `VITE_API_BASE_URL`
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT`
- `VITE_SENTRY_RELEASE`
- `VITE_STRIPE_PUBLISHABLE_KEY` (if billing UI is enabled)
- `VITE_PAYSTACK_PUBLIC_KEY` (if billing UI is enabled)

GitHub Action secrets:

- `STAGING_DEPLOY_HOOK_URL`
- `STAGING_API_HEALTH_URL`
- `STAGING_SYSTEM_HEALTH_URL`
- `PRODUCTION_DEPLOY_HOOK_URL`
- `PRODUCTION_ROLLBACK_HOOK_URL`
- `PRODUCTION_API_HEALTH_URL`
- `PRODUCTION_SYSTEM_HEALTH_URL`

## Rotation and Ownership Notes

- `owner-devops` maintains deploy hook URLs and environment secrets.
- `owner-backend` rotates backend runtime secrets on a 90-day cadence.
- `owner-frontend` verifies frontend runtime variables on each release cut.
- Emergency rotation: rotate compromised secret immediately, then update environment inventory and run post-rotation smoke checks.
