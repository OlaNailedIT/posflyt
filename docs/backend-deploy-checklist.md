# Backend: local & Render — failure modes and fix checklist

Use this when **local `npm run dev` fails**, **`GET /health` is 503**, **Render deploy crashes**, or **Prisma errors** (`P1001`, `P2021`, etc.).

## 1. Environment variables load order (fixed in code)

`backend/src/config/env.js` loads **`backend/.env`** using an absolute path, then falls back to the current working directory. **`server.js`** requires `./config/env` **before** `./app` so `DATABASE_URL` exists before Prisma and route modules run.

**You should still** keep secrets in **`backend/.env`** (local) or the host dashboard (Render), not only in the repo root.

## 2. Local development — step by step

| Step | Action |
|------|--------|
| 1 | `cd backend` |
| 2 | Copy `cp .env.example .env` (Windows: copy the file manually). |
| 3 | Set **`DATABASE_URL`** to a valid PostgreSQL URL (local Docker Postgres, Neon, etc.). For Neon pooler, include `?sslmode=require` and pooler params per Neon docs. |
| 4 | Set **`JWT_SECRET`** to a long random string (not the example placeholder in git). |
| 5 | `npm install` |
| 6 | `npm run prisma:generate` |
| 7 | `npx prisma migrate deploy` **or** `npm run prisma:migrate` (dev) so **all** tables exist, including `RefreshToken`. |
| 8 | `npm run dev` |
| 9 | `curl http://localhost:4000/health` — expect **`status: ok`** and **`database: connected`**. If **503**, DB URL is wrong or DB unreachable. |

**Common local mistakes**

- **P2021 / “table does not exist”** — migrations not applied. Run **`npx prisma migrate deploy`** from `backend` against that `DATABASE_URL`.
- **`dotenv injecting env (0)`** — no `.env` file next to `backend/package.json`, or file empty. Create/fill `backend/.env`.
- **Frontend can’t log in** — SPA must call your API. In dev, `VITE_API_URL` is optional; the app defaults to **`http://localhost:4000`** in dev (see `src/config/apiBaseUrl.js`). Restart Vite after changes.

## 3. Render — step by step

| Step | Action |
|------|--------|
| 1 | **Root directory:** `backend` (if the repo is a monorepo with frontend at root). |
| 2 | **Build command:** `npm install && npm run prisma:generate` (or `npm ci` if you use lockfile-only builds). |
| 3 | **Start command:** `npm run start:prod` — **not** `npm start`. `start:prod` runs **`prisma migrate deploy`** then **`node src/server.js`**. |
| 4 | **Environment (Render dashboard):** set at minimum **`DATABASE_URL`**, **`JWT_SECRET`**, **`CORS_ORIGIN`** (exact frontend origin, e.g. `https://your-app.vercel.app`), **`NODE_ENV=production`**. |
| 5 | **Port:** Render sets **`PORT`**; do not hardcode. |
| 6 | **Health check path:** `/health` (returns 200 when DB is up). |
| 7 | **Node version:** **20.x** (match `engines` in `backend/package.json`). Set via `NODE_VERSION` or Render’s Node setting. |

**Common Render mistakes**

- **Deploy fails on start** — `prisma migrate deploy` failed (bad `DATABASE_URL`, SSL, or migration conflict). Read Render **logs** for the Prisma error.
- **502 / crash loop** — missing `DATABASE_URL` or DB firewall blocks Render IPs (allow **Neon** / provider egress).
- **CORS errors in browser** — `CORS_ORIGIN` must include the **exact** origin (scheme + host, no path). Cookie auth requires **not** using `*` with credentials.
- **Wrong start command** — `npm start` skips migrations → **P2021** at runtime.

## 4. Quick log diagnosis

| Log / symptom | Likely cause |
|---------------|----------------|
| `Database connection failed` at boot | Invalid `DATABASE_URL`, network, or SSL. |
| `P1001` / connection timeout | Wrong host, firewall, or need pooler URL. |
| `P2021` table missing | Migrations not run — use `start:prod` or run `migrate deploy` manually once. |
| `Not allowed by CORS` | `CORS_ORIGIN` doesn’t match the browser origin. |
| `401` on API after deploy | `JWT_SECRET` changed — users must log in again. |

## 5. References

- `docs/deployment-production.md` — full env table  
- `docs/deployment-phase-3.1.md` — migrations and CI  
- `backend/README.md` — scripts and commands  
