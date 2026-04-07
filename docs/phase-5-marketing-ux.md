# Phase 5 — Marketing UX, conversion, analytics, accessibility

This document maps the Phase 5 brief to **what is implemented in code** and what remains **manual or tooling** (Lighthouse, A/B, third-party scripts).

## Implemented in the repo

| Area | Implementation |
|------|------------------|
| **Component breakdown** | `Hero`, `FeatureCard` + `FeaturesGrid`, `TestimonialCard`, `TrustMetrics`, `PricingTable`, `FaqAccordion`, `ContactForm`, `DashboardPreviewSlider`, `DashboardWidgets`, `Footer`, `StickyCtaBar` |
| **Hero CTAs** | Primary + secondary `TrackedLink`s with named events (`home_hero_primary`, `pricing_hero_secondary`, etc.) |
| **Motion** | Hover lift on feature cards and pricing rows; transitions on CTAs |
| **Trust** | `TestimonialCard` (avatar initials, name, role) + `TrustMetrics` on Home and About |
| **FAQ** | Accessible `details`/`summary` accordion on Pricing |
| **Sticky CTA** | `StickyCtaBar` on all marketing layout pages |
| **Forms** | Inline validation, `aria-invalid` / `aria-describedby`, auto-focus on name, `contact_form_submit` event |
| **Layout** | Semantic `<header>`, `<main id="main-content">`, padding under sticky bar |
| **Analytics** | `utils/analytics.js` + `AnalyticsProvider` — GA4 when `VITE_GA_MEASUREMENT_ID` is set; `dataLayer` push; SPA `page_view` on route change; `TrackedLink` for CTA clicks |
| **Default SEO** | `index.html` fallback; marketing routes use `SeoHead` (Helmet) for title, description, OG/Twitter, canonical, and JSON-LD |

## Configure externally

| Item | Notes |
|------|--------|
| **GA4** | Set `VITE_GA_MEASUREMENT_ID` in Vercel/host env; verify in GA4 DebugView |
| **Hotjar / Clarity** | Add script tags or GTM container in `index.html` when you have IDs |
| **Real pricing / phone / map** | Replace placeholders in `Pricing` and `Contact` |
| **Customer logos** | Add an asset row component when assets exist |

## Manual QA (recommended)

- **Responsive:** Chrome DevTools device mode — breakpoints align with Tailwind (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px); custom 320px check via narrow viewport |
| **Lighthouse:** Run on `/`, `/pricing`, `/contact` after deploy |
| **axe:** axe DevTools on key pages |
| **A/B tests:** Use your experimentation platform (flags on headlines/CTA color) — not wired in code |

## Event names (examples)

`navigation_click`, `hero_primary_cta`, `home_hero_primary`, `pricing_plan_cta`, `sticky_cta_click`, `contact_form_submit`, plus GA `page_view` via `gtag('config', …)`.

---

*Next steps:* wire real pricing, production analytics IDs, optional structured data (JSON-LD) in a later SEO pass.
