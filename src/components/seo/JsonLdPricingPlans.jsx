import { Helmet } from "react-helmet-async";
import { getSiteOrigin } from "../../config/siteSeo";

/** Static Product + Offer list for the marketing pricing table (placeholder prices OK until live). */
export default function JsonLdPricingPlans() {
  const origin = getSiteOrigin();

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "POSflyt Starter",
        description: "Basic POS and inventory for small teams.",
        brand: { "@type": "Brand", name: "POSflyt" },
        url: `${origin}/pricing`,
        offers: {
          "@type": "Offer",
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
          url: `${origin}/register`,
          description: "Monthly subscription; see pricing page for current amount.",
        },
      },
      {
        "@type": "Product",
        name: "POSflyt Professional",
        description: "POS, analytics, and reports for growing businesses.",
        brand: { "@type": "Brand", name: "POSflyt" },
        url: `${origin}/pricing`,
        offers: {
          "@type": "Offer",
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
          url: `${origin}/register`,
          description: "Monthly subscription; see pricing page for current amount.",
        },
      },
      {
        "@type": "Product",
        name: "POSflyt Enterprise",
        description: "Full features including API access.",
        brand: { "@type": "Brand", name: "POSflyt" },
        url: `${origin}/pricing`,
        offers: {
          "@type": "Offer",
          priceCurrency: "NGN",
          availability: "https://schema.org/PreOrder",
          url: `${origin}/contact`,
          description: "Custom pricing—contact sales.",
        },
      },
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(graph)}</script>
    </Helmet>
  );
}
