/**
 * Canonical site origin for OG URLs and JSON-LD.
 * Set `VITE_SITE_URL` in production (e.g. https://posflyt.com) — no trailing slash.
 */
export function getSiteOrigin() {
  const env = import.meta.env.VITE_SITE_URL;
  if (env && typeof env === "string") return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://posflyt.com";
}

/** Default share image path (served from `public/`). Add `public/og-image.png` for best social previews. */
export const DEFAULT_OG_IMAGE_PATH = "/og-image.png";

/** Comma-separated social profile URLs in env: VITE_ORG_SAME_AS */
export function getOrganizationSameAs() {
  const raw = import.meta.env.VITE_ORG_SAME_AS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const origin = getSiteOrigin();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}
