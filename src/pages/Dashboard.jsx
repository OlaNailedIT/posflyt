import Hero from "../components/Hero";
import DashboardPreviewSlider from "../components/DashboardPreviewSlider";
import DashboardWidgets from "../components/DashboardWidgets";
import SeoHead from "../components/seo/SeoHead";

const BLOCKS = [
  {
    title: "Live Analytics",
    body: "Sales trends, stock levels, and transaction history at a glance—POS dashboard insights for real-time analytics.",
  },
  {
    title: "Conflict-Aware Sync",
    body: "Offline POS sync designed to reduce duplicate or lost data when devices reconnect.",
  },
  {
    title: "Custom Reports",
    body: "Generate and export reports for accounting or management reviews.",
  },
  {
    title: "Notifications",
    body: "Stay informed with alerts for low stock, failed syncs, or errors that need attention.",
  },
];

/**
 * Public marketing page for the POSflyt dashboard story.
 * Route: `/features/dashboard` (app dashboard remains `/dashboard` when logged in).
 */
export default function Dashboard() {
  return (
    <>
      <SeoHead
        title="POSflyt Dashboard — Live Business Insights"
        description="See sales, inventory, and transactions in one place. Real-time POS dashboard with offline sync and reports for SMB teams."
        keywords="POS dashboard, real-time analytics, offline POS sync, business reporting"
      />
      <Hero
        title="Monitor. Analyze. Grow."
        subtitle="A dashboard that keeps you in control."
        primaryCta={{ to: "/register", children: "Try Dashboard Demo →", event: "dashboard_hero_primary" }}
        secondaryCta={{ to: "/contact", children: "Request a live walkthrough", event: "dashboard_hero_secondary" }}
      />

      <section className="mx-auto max-w-6xl px-4 pb-12" aria-label="Dashboard preview">
        <DashboardPreviewSlider />
      </section>

      <DashboardWidgets blocks={BLOCKS} />
    </>
  );
}
