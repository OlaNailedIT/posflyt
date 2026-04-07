# Phase 1 — Website revamp: audit & prompt planning

This document records the **current marketing site state**, **routing constraints**, **messaging pillars**, **SEO targets**, a **reusable prompt template** for copy/AI, and **recommended next steps** (implementation phases). It aligns with the Phase 1 objectives: modular pages, SMB-focused copy, SEO structure, and conversion CTAs.

---

## 1. Objectives (summary)

| Goal | Phase 1 outcome |
|------|-----------------|
| Modular pages | Plan distinct URLs and content ownership (see §4). |
| SEO | Define meta title, description, and heading hierarchy per page; note SPA limitations (§5). |
| SMB positioning | Anchor copy on five messaging pillars (§3). |
| Conversion | Standardize CTAs: sign-up, free trial, demo (§6). |

---

## 2. Current codebase audit (as of revamp planning)

### 2.1 Routing

- **Marketing:** `LandingPage` is a **single long page** at `/` (and region variants `/ng`, `/za`) with sections composed in `src/pages/LandingPage.jsx`.
- **App (authenticated):** `/dashboard`, `/pos`, `/inventory`, etc. sit under `ProtectedRoute` + `AppShell` in `src/App.jsx`.
- **Conflict:** A public “Dashboard product tour” page **cannot** use the path `/dashboard` without clashing with the **authenticated** dashboard. Use a **marketing-only** path (recommended: **`/features/dashboard`** or **`/product/dashboard`**).

### 2.2 Components (landing stack)

| Area | Primary files |
|------|----------------|
| Shell | `Navbar`, `Footer` under `src/components/landing/` |
| Sections | `Hero`, `Features`, `ProductMockupsSection`, `ProductWorkflowSection`, `TrustSignalsSection`, `DashboardPreview`, `Pricing` |
| Styling | Tailwind; gradient background on `LandingPage` |

### 2.3 SEO & meta today

- **`index.html`:** static `<title>POSflyt</title>`; no per-route meta description.
- **SPA:** search engines and social crawlers need either **SSR/prerender** for ideal SEO or **per-route `<title>` + meta** updated client-side (e.g. `react-helmet-async`) plus optional prerender for critical URLs.

### 2.4 Gaps vs Phase 1 vision

| Desired | Current |
|---------|---------|
| Separate Home, About, Pricing, Dashboard (marketing), Contact | Single home; About/Contact not standalone; Pricing is a section |
| Per-page meta title & description | Single global title |
| Explicit H1/H2/H3 per page | Mixed; one page with many sections |
| Lead magnet / demo CTA strategy | CTAs in Hero/Pricing; not unified across pages |

---

## 3. Core messaging pillars (use in all copy)

| Pillar | Line to reinforce |
|--------|-------------------|
| **Reliability & trust** | Never miss a sale—track inventory and run the business with confidence. |
| **Scalability** | Built for growing SMBs that want serious POS and inventory capabilities. |
| **Efficiency** | Save time, reduce errors, automate sales workflows. |
| **Insights & control** | Real-time reports, dashboards, and analytics. |
| **Ease of use** | Set up in minutes; intuitive, mobile-ready. |

Tone: **growth-focused SMB owners and operators** in Nigeria and adjacent markets; professional, clear, non-jargon-heavy.

---

## 4. Recommended URL map (modular site)

Avoids clash with the authenticated app:

| Page | Recommended path | Notes |
|------|------------------|--------|
| Home | `/` | Hero, USP grid, social proof, primary CTAs. |
| About | `/about` | Mission, differentiation, team/milestones. |
| Pricing | `/pricing` | Plans, FAQ; can reuse/refine `Pricing` section component. |
| Dashboard (marketing) | **`/features/dashboard`** | Screenshots, tour, “analytics & sync” story. SEO title can still say “POSflyt Dashboard”. |
| Contact | `/contact` | Form, email, phone, support vs sales; map optional. |

**Internal links:** Home → About, Pricing, Features/Dashboard, Contact; footer on every page; consistent “Get started” / “Book a demo”.

**Region variants:** Preserve `/ng` and `/za` if needed; either duplicate routes (`/ng/about`) or keep regions on home only and use global marketing pages (product decision).

---

## 5. SEO targets (drafts for copy refinement)

| Page | Meta title (target) | Meta description (draft) |
|------|---------------------|---------------------------|
| Home | Point-of-Sale system for SMBs in Nigeria \| POSflyt | POS and inventory for growing businesses: offline POS, real-time sync, reports, and simple pricing. Start free—run your store from anywhere. |
| About | About POSflyt \| Inventory & POS Software for SMBs | Why POSflyt exists: dependable POS, inventory, and insights for SMBs. Built for operators who want control without enterprise complexity. |
| Pricing | POSflyt Pricing \| Affordable POS & Inventory Plans | Compare plans, billing, and what’s included. Start a trial or talk to us—transparent pricing for SMBs. |
| Features / Dashboard (marketing) | POSflyt Dashboard \| Business Analytics & POS Overview | See how dashboards, reports, and sync keep your team aligned—real-time visibility for SMB owners. |
| Contact | Contact POSflyt \| Get Support or Demo | Reach sales or support: request a demo, ask a question, or get help with your account. |

**Headings:** Every page should have **one H1** (primary topic), **H2** for major sections, **H3** for subsections. Match keywords naturally (POS, inventory, SMB, Nigeria, analytics, offline sync).

**Images:** Descriptive `alt` text (product UI, team, Nigeria business context—avoid empty alts).

---

## 6. CTAs (standardize)

| Purpose | Example label | Destination |
|---------|---------------|----------------|
| Primary acquisition | Get started, Start free trial | `/register` |
| Login | Log in | `/login` |
| Demo | Book a demo / Request demo | Contact form or `/contact` |
| Secondary | View pricing | `/pricing` |

---

## 7. Prompt engineering template (AI or copy team)

Use this template so outputs stay on-brand and complete.

**Role:** You are a senior web developer, product strategist, and expert copywriter helping revamp POSflyt’s public website for SMB owners in Nigeria and similar markets.

**Task:** Produce content for **one page at a time** from: Home, About, Pricing, Dashboard (marketing), Contact.

**Objectives:**

1. Persuasive, concise copy aligned with the five pillars in §3.
2. Clear USPs: reliability, scalability, efficiency, analytics, ease of use.
3. SEO: one H1, logical H2/H3, meta title ≤ ~60 characters, meta description ≤ ~155 characters, alt suggestions for each proposed image.
4. Audience: growth-focused SMB owners and professionals who want efficiency and control.
5. Clear CTAs: sign-up, free trial, demo (as applicable).
6. Layout/visual notes: section order, suggested imagery or embed (e.g. product screenshot, short video).

**Deliverables per page:**

- Meta title and meta description.
- H1, H2, H3 outline with draft copy under each.
- Hero + key sections (benefits, proof, FAQ where relevant).
- Image/alt and embed suggestions.
- Natural keyword list (no stuffing).
- Internal links to other planned pages.

**Constraints:**

- Do not promise features the product does not ship; align with actual POSflyt capabilities (POS, inventory, sync, reports, billing, roles).
- Avoid unverifiable claims (“#1 in Nigeria”) unless you have evidence.

---

## 8. Implementation handoff (later phases)

| Phase | Work |
|-------|------|
| **2 — Structure** | Add routes (`/about`, `/pricing`, `/features/dashboard`, `/contact`), shared `MarketingLayout`, extract/reuse landing sections. |
| **3 — SEO** | Add `react-helmet-async` or equivalent; per-route title/description; consider prerender for top URLs. |
| **4 — Content** | Replace drafts with final copy; add testimonials/logos when available. |
| **5 — Conversion** | Analytics events on CTAs; optional form backend for demo requests. |

### Implemented (content + technical)

- **Routes:** `/`, `/ng`, `/za` → `pages/Home.jsx`; `/about`, `/pricing`, `/contact`, `/features/dashboard` → `About`, `Pricing`, `Contact`, `Dashboard` (marketing story; authenticated app remains at `/dashboard`).
- **Layout:** `MarketingLayout` + `Navbar` / `components/Footer.jsx` with internal links and footer CTA **Get Started Today →**.
- **SEO:** `utils/seo.js` (`setSEO` / `useSEO`) updates `document.title` and meta description per page; placeholders noted for pricing (`₦X,XXX/mo`), phone, map, and dashboard media.
- **Structure:** Centralized routes in `routes/AppRouter.jsx`; modular components (`Hero`, `FeaturesGrid`, `Testimonials`, `PricingTable`, `ContactForm`, `DashboardWidgets`, `Footer`).
- **Contact form:** Client-side success state only — wire to email/CRM in production.

---

## 9. Revision

| Date | Change |
|------|--------|
| 2026-04-07 | Phase 1 audit, routing constraint, messaging pillars, SEO drafts, prompt template |

---

*Conclusion:* Phase 1 is **planning and alignment**: the repo today is a **single-page marketing home** plus a **separate app shell**; the marketing “Dashboard” story must live under a **dedicated path** such as **`/features/dashboard`**. Use §7 for consistent AI or human copy generation, then implement routes and meta in Phase 2+.
