/**
 * GA4 / GTM / dataLayer (Phase 5 & 8).
 *
 * - Prefer **either** `VITE_GTM_ID` (container loads GA4 + tags in GTM) **or** direct `VITE_GA_MEASUREMENT_ID`.
 * - Optional: `VITE_GOOGLE_ADS_ID` (AW-…), `VITE_META_PIXEL_ID` — see `MarketingPixels.jsx`.
 */

let directGaInitialized = false;
let gtmInitialized = false;

export function pushDataLayer(payload) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

/**
 * Google Tag Manager (loads tags you configure in the container, e.g. GA4 + Ads).
 * @param {string} containerId e.g. GTM-XXXX
 */
export function initGtm(containerId) {
  if (!containerId || gtmInitialized || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  gtmInitialized = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(s);
}

/**
 * @param {string} measurementId GA4 ID (G-…)
 */
export function initGa4(measurementId) {
  if (!measurementId || directGaInitialized || gtmInitialized || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  directGaInitialized = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
}

/**
 * Google Ads remarketing / conversion tag (AW-…). Safe to load after gtag exists.
 */
export function initGoogleAdsRemarketing(awId) {
  if (!awId || typeof document === "undefined") return;
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(awId)}`;
  s.onload = () => {
    window.gtag("js", new Date());
    window.gtag("config", awId);
  };
  document.head.appendChild(s);
}

let metaPixelInitialized = false;

/**
 * Meta (Facebook) Pixel — PageView on load; call `fbq` for conversions elsewhere.
 * @param {string} pixelId Numeric pixel ID
 */
export function initMetaPixel(pixelId) {
  if (!pixelId || metaPixelInitialized || typeof document === "undefined") return;
  metaPixelInitialized = true;
  const w = window;
  if (w.fbq) return;
  const n = function fbq() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!w.fbq) w.fbq = n;
  n.push = n;
  n.loaded = !0;
  n.version = "2.0";
  n.queue = [];
  const t = document.createElement("script");
  t.async = !0;
  t.src = "https://connect.facebook.net/en_US/fbevents.js";
  const s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(t, s);
  w.fbq("init", pixelId);
}

export function trackMetaPageView() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "PageView");
  }
}

export function trackMetaConversion(eventName, params) {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", eventName, params || {});
  }
}

/**
 * SPA page views — route changes.
 * @param {string} path
 */
export function trackPageView(path) {
  const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  pushDataLayer({ event: "page_view", page_path: path });
  if (typeof window !== "undefined" && window.gtag && gaId) {
    window.gtag("config", gaId, { page_path: path });
  }
  if (gtmInitialized) {
    pushDataLayer({ event: "virtual_page_view", page_path: path });
  }
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [params]
 */
export function trackEvent(name, params = {}) {
  pushDataLayer({ event: name, ...params });
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, params);
  }
}
