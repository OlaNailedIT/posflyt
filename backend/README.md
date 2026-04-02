# POSflyt Backend

Express + Prisma + PostgreSQL backend for POSflyt SaaS POS/ERP.

## Setup

1. Copy env file:
   - `cp .env.example .env` (or create `.env` manually on Windows)
2. Update `DATABASE_URL` and `JWT_SECRET`
3. Install deps:
   - `npm install`
4. Generate Prisma client and run migrations:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
5. Start server:
   - `npm run dev`

## API routes

- `POST /auth/register`
- `POST /auth/login`
- `GET /products`
- `POST /products`
- `PUT /products/:id`
- `POST /transactions`
- `GET /transactions`
- `GET /dashboard-stats`

Protected routes require: `Authorization: Bearer <jwt>`.
