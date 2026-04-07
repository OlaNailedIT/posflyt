import { Helmet } from "react-helmet-async";
import { absoluteUrl, getOrganizationSameAs, getSiteOrigin } from "../../config/siteSeo";

/** Global Organization + WebSite schema for marketing pages. */
export default function JsonLdOrganization() {
  const origin = getSiteOrigin();
  const sameAs = getOrganizationSameAs();

  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "POSflyt",
    url: origin,
    logo: absoluteUrl("/favicon.svg"),
    description:
      "Offline-first POS and inventory for small and medium businesses—real-time dashboards, sync, and simple pricing.",
    ...(sameAs.length ? { sameAs } : {}),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "POSflyt",
    url: origin,
    publisher: { "@type": "Organization", name: "POSflyt", url: origin },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(org)}</script>
      <script type="application/ld+json">{JSON.stringify(website)}</script>
    </Helmet>
  );
}
