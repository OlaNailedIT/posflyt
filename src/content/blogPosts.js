/** Marketing blog posts (Phase 8). Add posts here; routes resolve by `slug`. */

export const BLOG_POSTS = [
  {
    slug: "offline-pos-best-practices",
    title: "Offline-first POS: best practices for SMBs",
    excerpt:
      "How to keep selling when connectivity fails, protect data integrity, and sync cleanly when you are back online.",
    date: "2026-01-18",
    readTime: "6 min read",
    category: "Operations",
    body: [
      "Retail and hospitality teams lose revenue when the network drops. An offline-first POS lets you keep taking sales, then reconcile when sync returns—without double charges or lost lines.",
      "Start with clear idempotency: every sale should have a client-side key so the server can ignore duplicates. Batch uploads reduce API load and play nicely with usage quotas on higher tiers.",
      "Train staff on conflict flows: when two devices change the same product, your app should surface a resolution path instead of silent overwrites. That is how you keep inventory trustworthy.",
      "Finally, measure sync health: track failed syncs and time-to-recovery. POSflyt surfaces sync status so you can fix issues before they become support tickets.",
    ],
    cta: { label: "Start free trial", to: "/register", event: "blog_cta_offline" },
  },
  {
    slug: "reporting-that-drives-revenue",
    title: "Reporting that drives revenue—not just charts",
    excerpt:
      "Turn POS and inventory data into actions: margin, basket size, and staff performance without spreadsheet gymnastics.",
    date: "2026-02-02",
    readTime: "5 min read",
    category: "Growth",
    body: [
      "Dashboards only matter if someone acts on them. Start with three numbers: revenue by channel, gross margin by category, and inventory days on hand. If those move, your business moves.",
      "Segment by store and shift to see real patterns. SMB owners often discover one location carries the team—then they coach, reallocate stock, or adjust promotions.",
      "When you are ready for deeper analytics, graduate to BI-style drill-downs and scheduled exports. Tie every report to a weekly decision ritual so data becomes habit.",
      "POSflyt grows with you: from core POS metrics to advanced analytics and integrations on higher tiers—always with server-side access control.",
    ],
    cta: { label: "View pricing", to: "/pricing", event: "blog_cta_reporting" },
  },
];

export function getPostBySlug(slug) {
  return BLOG_POSTS.find((p) => p.slug === slug) || null;
}
