import { Helmet } from "react-helmet-async";
import { getSiteOrigin } from "../../config/siteSeo";

/** Product / software offering — typically on Home only. */
export default function JsonLdSoftwareApplication() {
  const origin = getSiteOrigin();

  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "POSflyt",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "NGN",
      description: "Free trial available; paid plans for full features.",
    },
    url: origin,
    description:
      "Point-of-sale and inventory management with offline-first sync, analytics, and multi-location support for SMBs.",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      bestRating: "5",
      ratingCount: "127",
    },
    review: {
      "@type": "Review",
      author: { "@type": "Person", name: "Adeola M." },
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
      reviewBody:
        "POSflyt transformed how we manage sales — efficient, reliable, and intuitive for our retail team.",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(app)}</script>
    </Helmet>
  );
}
