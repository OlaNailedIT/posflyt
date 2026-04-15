/** Avoid toast spam during flaky networks (e.g. offline POS). */
let lastFriendlyToastAt = 0;
const COOLDOWN_MS = 7000;

/**
 * Strip stack traces and database internals so nothing technical reaches the UI.
 * @param {unknown} raw
 */
function sanitizeBackendMessage(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s || s.length > 200) return "";
  if (/\n|\r/.test(s)) return "";
  if (/prisma|postgresql|query engine|relation\s+["']|invalid\s+`prisma|ECONNREFUSED|socket hang up/i.test(s)) {
    return "";
  }
  if (/\bat\s+[\w.$/\\]+\s*\(/i.test(s)) return "";
  return s;
}

/**
 * @param {import("axios").AxiosError} error
 */
export function getFriendlyErrorMessage(error) {
  if (!error?.response) {
    if (error?.isNetworkError || error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
      return "We couldn't reach the server. Check your connection. Your work on this device is saved until it can sync.";
    }
    return "Something went wrong. Check your connection and try again.";
  }

  const status = error.response.status;
  const code = error.response?.data?.code;
  const msg = sanitizeBackendMessage(error.response?.data?.message);

  if (code === "CONFLICT") return null;
  if (status === 429 || code === "QUOTA_EXCEEDED") return null;
  if (status === 403 && code === "FEATURE_DISABLED") return null;
  if (status === 402 || code === "PAYMENT_REQUIRED") return null;

  if (status === 503) {
    return "The service is temporarily busy. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "We're having a temporary server issue. Your data on this device is safe; try again shortly.";
  }
  if (status === 404) {
    return msg || "We couldn't find that record. It may have been removed or the link is outdated.";
  }
  if (status === 400 || status === 422) {
    return msg || "Please check the information and try again.";
  }
  if (msg) return msg;
  return "Something went wrong. Please try again.";
}

/**
 * Shows at most one friendly error toast per {@link COOLDOWN_MS} (network + server errors).
 * @param {import("axios").AxiosError} error
 * @param {(msg: string, kind: 'error'|'warning') => void} showToast
 */
export function showFriendlyErrorToast(error, showToast) {
  const msg = getFriendlyErrorMessage(error);
  if (!msg) return;
  const now = Date.now();
  if (now - lastFriendlyToastAt < COOLDOWN_MS) return;
  lastFriendlyToastAt = now;
  showToast(msg, "error");
}
