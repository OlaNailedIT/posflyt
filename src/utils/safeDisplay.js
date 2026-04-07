/**
 * Phase 7.2 — UI output safety. React text nodes escape HTML by default.
 * Use this when interpolating into URLs, or if you ever use dangerouslySetInnerHTML.
 */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Encode for use in a URL query or path segment (UTF-8 safe). */
export function encodeUriComponentSafe(s) {
  try {
    return encodeURIComponent(String(s));
  } catch {
    return "";
  }
}
