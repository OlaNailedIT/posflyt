import Hero from "../components/Hero";
import TrustMetrics from "../components/TrustMetrics";
import SeoHead from "../components/seo/SeoHead";

export default function About() {
  return (
    <>
      <SeoHead
        title="About POSflyt — Trusted POS & Inventory for SMBs"
        description="Our mission: simple, reliable POS and inventory for small businesses—accurate stock, offline resilience, and analytics that help you grow with confidence."
        keywords="About POSflyt, SMB POS solutions, trusted POS software"
      />
      <Hero
        title="We Build Systems That Work For Your Business"
        subtitle="Our mission: simplify, scale, and secure your operations."
        primaryCta={{ to: "/register", children: "Join thousands of businesses growing with POSflyt →", event: "about_hero_primary" }}
        secondaryCta={{ to: "/pricing", children: "View pricing", event: "about_hero_secondary" }}
      />

      <section className="mx-auto max-w-6xl px-4 pb-12" aria-label="At a glance">
        <TrustMetrics />
      </section>

      <div className="mx-auto max-w-3xl space-y-12 px-4 pb-20">
        <section>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Our Story</h2>
          <p className="mt-3 text-stone-600 dark:text-stone-400">
            POSflyt was founded to address everyday small business challenges with modern POS technology—where
            reliability, inventory accuracy, and clarity matter more than buzzwords. We focus on SMB POS solutions
            that teams can adopt quickly and run with confidence.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Our Values</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-stone-600 dark:text-stone-400">
            <li>
              <strong className="text-stone-800 dark:text-stone-200">Reliability</strong> — your sales and stock data
              stay trustworthy.
            </li>
            <li>
              <strong className="text-stone-800 dark:text-stone-200">Transparency</strong> — clear pricing and honest
              product communication.
            </li>
            <li>
              <strong className="text-stone-800 dark:text-stone-200">Innovation</strong> — offline-first sync,
              analytics, and workflows that save time.
            </li>
            <li>
              <strong className="text-stone-800 dark:text-stone-200">User-first</strong> — we build for operators on
              the shop floor, not slide decks.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Leadership &amp; team</h2>
          <p className="mt-3 text-stone-600 dark:text-stone-400">
            Our founders and engineers ship the features you depend on—from offline-first synchronization to the
            analytics engine behind your dashboards. We are a product-led team obsessed with uptime, security, and
            support.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Milestones</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-stone-600 dark:text-stone-400">
            <li>Thousands of daily transactions processed securely</li>
            <li>Multi-city deployment across Nigeria and growing regions</li>
            <li>Integrated, secure payment flows aligned with your plan</li>
          </ul>
        </section>
      </div>
    </>
  );
}
