import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { absoluteUrl, getSiteOrigin, DEFAULT_OG_IMAGE_PATH } from "../../config/siteSeo";

/**
 * Per-route SEO: title, description, keywords, canonical, Open Graph, Twitter Card, WebPage JSON-LD.
 * Titles should be ≤ ~60 characters; descriptions ≤ ~160 for best SERP display.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   keywords?: string,
 *   ogTitle?: string,
 *   ogDescription?: string,
 *   ogImage?: string,
 *   ogType?: string,
 *   twitterCard?: "summary" | "summary_large_image",
 *   noIndex?: boolean,
 *   includeWebPageJsonLd?: boolean,
 * }} props
 */
export default function SeoHead({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage,
  ogType = "website",
  twitterCard = "summary_large_image",
  noIndex = false,
  includeWebPageJsonLd = true,
}) {
  const location = useLocation();
  const origin = getSiteOrigin();
  const path = `${location.pathname}${location.search}`;
  const canonical = `${origin}${path}`;
  const imageAbs = ogImage ? absoluteUrl(ogImage) : absoluteUrl(DEFAULT_OG_IMAGE_PATH);

  const webPageLd =
    includeWebPageJsonLd && title && description
      ? {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: title,
          description,
          url: canonical,
          isPartOf: { "@type": "WebSite", name: "POSflyt", url: origin },
        }
      : null;

  const displayOgTitle = ogTitle || title;
  const displayOgDesc = ogDescription || description;

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      {noIndex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow" />}
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="POSflyt" />
      <meta property="og:title" content={displayOgTitle} />
      <meta property="og:description" content={displayOgDesc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={imageAbs} />
      <meta property="og:locale" content="en_NG" />

      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={displayOgTitle} />
      <meta name="twitter:description" content={displayOgDesc} />
      <meta name="twitter:image" content={imageAbs} />

      {webPageLd ? (
        <script type="application/ld+json">{JSON.stringify(webPageLd)}</script>
      ) : null}
    </Helmet>
  );
}
