import { nowISOString } from "./safeDate.js";

const STORAGE_KEY = "posflyt_attribution_v1";

/**
 * Capture UTM, click ids, and referral code from the URL once per session.
 * Used for GA4 conversions, Meta/Google Ads, and future CRM sync (Phase 8.3).
 */
export function captureAttributionFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return JSON.parse(existing);

    const params = new URLSearchParams(window.location.search);
    const keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "msclkid",
      "ttclid",
      "ref",
    ];
    const out = {};
    let any = false;
    for (const k of keys) {
      const v = params.get(k);
      if (v) {
        out[k] = v;
        any = true;
      }
    }
    if (any) {
      out.capturedAt = nowISOString();
      out.landingPath = window.location.pathname + window.location.search;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    }
    return any ? out : null;
  } catch {
    return null;
  }
}

export function getStoredAttribution() {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
