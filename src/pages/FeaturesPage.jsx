import { Link } from "react-router-dom";
import SeoHead from "../components/seo/SeoHead";
import TrackedLink from "../components/TrackedLink";

const pillars = [
  {
    title: "Speed & simplicity",
    body: "Fast checkout flows, minimal taps, and a UI your team learns in one shift—so you spend time on customers, not training manuals.",
    icon: "⚡",
  },
  {
    title: "Offline-first reliability",
    body: "Keep selling when Wi‑Fi drops. Local-first POS with deterministic sync and conflict handling—no silent inventory corruption.",
    icon: "📴",
  },
  {
    title: "Distributed-system guarantees",
    body: "Idempotent sync, audit trails, and clear recovery paths. Built for real stores where devices and branches disagree sometimes.",
    icon: "🔗",
  },
  {
    title: "Revenue-driving features",
    body: "Billing, subscriptions, reporting, BI drill-downs, and integrations on higher tiers—turn operations data into upgrades and retention.",
    icon: "💳",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SeoHead
        title="POSflyt Features — Offline POS, Sync & Revenue Tools"
        description="Speed, simplicity, and reliability: offline-first POS, distributed sync, billing, reporting, and integrations for SMB retailers."
        keywords="offline POS, retail POS features, SMB billing, POS reporting, inventory sync"
      />
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-400">
          Product overview
        </p>
        <h1 className="mt-3 text-4xl font-black text-stone-900 md:text-5xl dark:text-stone-50">
          Everything you need to run retail—without enterprise baggage
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
          POSflyt combines point of sale, inventory, and growth tooling in one stack. Start simple on the free tier; unlock analytics,
          BI, and automation as you scale.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <TrackedLink
            to="/register"
            eventName="features_primary_cta"
            eventParams={{ placement: "hero" }}
            className="inline-flex rounded-lg bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            Start free trial →
          </TrackedLink>
          <TrackedLink
            to="/features/dashboard"
            eventName="features_secondary_cta"
            eventParams={{ placement: "hero" }}
            className="inline-flex rounded-lg border border-stone-300 px-6 py-3 text-base font-semibold text-stone-800 hover:bg-white/60 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800/60"
          >
            Explore the dashboard demo
          </TrackedLink>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white/60 py-14 dark:border-stone-800 dark:bg-stone-900/40">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Why teams choose POSflyt</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-2">
            {pillars.map((p) => (
              <li
                key={p.title}
                className="rounded-2xl border border-stone-200 bg-stone-50/80 p-5 dark:border-stone-700 dark:bg-stone-950/50"
              >
                <span className="text-2xl" aria-hidden>
                  {p.icon}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">{p.title}</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Plans that match how you grow</h2>
        <p className="mt-3 max-w-2xl text-stone-600 dark:text-stone-400">
          Free tier for activation; Basic and Premium add reporting, BI, exports, higher quotas, and integrations. Upgrade in-app with
          idempotent, webhook-verified billing.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/pricing"
            className="font-semibold text-teal-700 underline decoration-teal-600/40 hover:decoration-teal-700 dark:text-teal-400"
          >
            Compare pricing →
          </Link>
          <Link
            to="/blog"
            className="font-semibold text-teal-700 underline decoration-teal-600/40 hover:decoration-teal-700 dark:text-teal-400"
          >
            Read growth guides →
          </Link>
        </div>
      </section>
    </>
  );
}
