# Phase 6 — SEO foundation

## What was implemented

- **Per-route meta** via `src/components/seo/SeoHead.jsx` (`react-helmet-async`): unique `<title>` and `<meta name="description">` (aim &lt; ~60 / ~160 characters), optional keywords, `robots`, **canonical** URL, **Open Graph** (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:locale`), and **Twitter Card** (`twitter:card`, title, description, image).
- **JSON-LD**: global **Organization** + **WebSite** on all marketing routes (`JsonLdOrganization` in `MarketingLayout`); **WebPage** on each route via `SeoHead`; **SoftwareApplication** on Home; **Product** offers for Starter / Professional / Enterprise on Pricing (`JsonLdPricingPlans`).
- **Canonical origin**: `VITE_SITE_URL` in `.env` (see `.env.example`). Falls back to `window.location.origin` in the browser, then `https://posflyt.com`.
- **Default share image**: `public/og-image.png` (referenced as `/og-image.png`). Add a 1200×630 image for best social previews; until then crawlers still receive a stable URL.
- **Static asset caching** (Vercel): `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` in `vercel.json`.
- **Legacy** `utils/seo.js` `setSEO` / `useSEO` kept for non-marketing use; marketing pages use `SeoHead` only.

## URL structure

| Page | Public URL |
|------|------------|
| Home | `/`, `/ng`, `/za` |
| About | `/about` |
| Pricing | `/pricing` |
| Marketing dashboard story | `/features/dashboard` |
| Contact | `/contact` |

The **authenticated app** dashboard stays at **`/dashboard`** (protected). The marketing “dashboard” story intentionally uses **`/features/dashboard`** so routes do not collide.

## Lighthouse / Core Web Vitals

Run Chrome Lighthouse on production or `npm run build` + `npm run preview` against the deployed origin. Targets: LCP &lt; 2.5s, INP/FID &lt; 100ms, CLS &lt; 0.1. Vite minifies JS/CSS; lazy routes in `AppRouter` reduce initial JS for marketing vs. app shells.

## Analytics

GA4 remains optional via `VITE_GA_MEASUREMENT_ID`; `TrackedLink` and layout events continue to push to `dataLayer` when configured.
