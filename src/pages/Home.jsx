import { Link } from "react-router-dom";
import Hero from "../components/Hero";
import FeaturesGrid from "../components/FeaturesGrid";
import Testimonials from "../components/Testimonials";
import SeoHead from "../components/seo/SeoHead";
import JsonLdSoftwareApplication from "../components/seo/JsonLdSoftwareApplication";

const FEATURES = [
  {
    icon: "📊",
    title: "Real-Time Sales & Inventory",
    description:
      "Track every sale and stock level instantly across your business—POS system Nigeria teams rely on for accuracy.",
  },
  {
    icon: "📴",
    title: "Offline-First Reliability",
    description:
      "Keep selling when connectivity drops. Offline POS sync protects data integrity until you are back online.",
  },
  {
    icon: "📈",
    title: "Powerful Analytics",
    description:
      "Business analytics and live reports so you can decide faster with inventory software SMB operators need.",
  },
  {
    icon: "⚡",
    title: "Automated Workflows",
    description: "Save time with smart automation—fewer manual steps from checkout to stock adjustments.",
  },
];

export default function Home() {
  return (
    <>
      <SeoHead
        title="POSflyt — Seamless POS & Inventory for Modern Retail"
        description="Offline-first POS and inventory for retailers: fast checkout, stock control, and real-time dashboards. Scale operations without enterprise complexity."
        keywords="POS system Nigeria, inventory software SMB, offline POS, business analytics"
        ogTitle="POSflyt — Seamless POS & Inventory"
        ogDescription="Scale retail operations with POSflyt’s offline-first POS and inventory—sync, reports, and clarity for growing teams."
      />
      <JsonLdSoftwareApplication />
      <Hero
        eyebrow="POS & inventory for growing businesses"
        title="Your Business. Smarter. Faster. Better."
        subtitle="All-in-one POS & Inventory system built to scale with your business."
        primaryCta={{ to: "/register", children: "Start Free Trial →", event: "home_hero_primary" }}
        secondaryCta={{ to: "/features/dashboard", children: "See the dashboard", event: "home_hero_secondary" }}
        subline="No credit card required, instant setup, mobile-friendly."
      />

      <FeaturesGrid
        id="how-it-works"
        heading="Built for reliability and growth"
        subheading="Enterprise-level features for small businesses—without enterprise complexity."
        features={FEATURES}
      />

      <Testimonials />

      <section className="mx-auto max-w-6xl px-4 py-14 text-center" aria-labelledby="home-bottom-cta">
        <h2 id="home-bottom-cta" className="text-2xl font-bold text-stone-900 dark:text-stone-100">
          Ready to simplify sales?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600 dark:text-stone-400">
          Explore{" "}
          <Link to="/pricing" className="font-medium text-teal-700 underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-teal-400">
            pricing
          </Link>{" "}
          or learn{" "}
          <Link to="/about" className="font-medium text-teal-700 underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-teal-400">
            about us
          </Link>
          .
        </p>
      </section>
    </>
  );
}
