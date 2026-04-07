import Hero from "../components/Hero";
import FaqAccordion from "../components/FaqAccordion";
import PricingTable from "../components/PricingTable";
import TrackedLink from "../components/TrackedLink";
import SeoHead from "../components/seo/SeoHead";
import JsonLdPricingPlans from "../components/seo/JsonLdPricingPlans";

const PLANS = [
  {
    name: "Starter",
    features: "Basic POS + Inventory",
    price: "₦X,XXX/mo",
    cta: "Start Free Trial",
  },
  {
    name: "Professional",
    features: "POS + Analytics + Reports",
    price: "₦X,XXX/mo",
    highlight: true,
    cta: "Start Free Trial",
  },
  {
    name: "Enterprise",
    features: "All features + API access",
    price: "Custom",
    cta: "Contact sales",
  },
];

const FAQ = [
  { id: "faq-upgrade", q: "Can I upgrade later?", a: "Yes, upgrade anytime." },
  { id: "faq-trial", q: "Is there a free trial?", a: "Yes, 14-day free trial." },
];

export default function Pricing() {
  return (
    <>
      <SeoHead
        title="POSflyt Pricing — POS & Inventory Plans"
        description="Compare POSflyt plans for POS, inventory, and analytics. Transparent tiers, scalable features, and a free trial—pick what fits your business."
        keywords="POS pricing Nigeria, inventory software cost, POS subscription plans"
        ogType="product"
      />
      <JsonLdPricingPlans />
      <Hero
        title="Simple, Transparent Pricing"
        subtitle="Choose a plan that grows with your business."
        primaryCta={{ to: "/register", children: "Start Free Trial", event: "pricing_hero_primary" }}
        secondaryCta={{ to: "/contact", children: "Contact us", event: "pricing_hero_secondary" }}
      />

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <PricingTable plans={PLANS} />
        <p className="mt-3 text-center text-xs text-stone-500 dark:text-stone-500">
          Placeholder pricing—replace ₦X,XXX/mo with live numbers when ready.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-bold text-stone-900 dark:text-stone-100">
          Frequently asked questions
        </h2>
        <div className="mt-6">
          <FaqAccordion items={FAQ} />
        </div>
        <div className="mt-10 text-center">
          <TrackedLink
            to="/register"
            eventName="pricing_footer_cta"
            className="inline-flex rounded-lg bg-teal-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            Sign Up Today →
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
