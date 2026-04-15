/**
 * Checkout / sync retry policy: do not guess "offline" from navigator alone — treat transport
 * failures and transient server responses as eligible for local queue + retry.
 */

/** Client / auth / validation — do not queue. (408 + 429 are retryable — see below.) */
const NON_RETRY_HTTP = new Set([400, 401, 402, 403, 404, 409, 410, 412, 413, 414, 415, 422, 423]);

const TRANSPORT_CODES = new Set([
  "ERR_NETWORK",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_TIMED_OUT",
]);

function isNonRetryHttpStatus(status) {
  if (status == null || typeof status !== "number") return false;
  if (NON_RETRY_HTTP.has(status)) return true;
  if (status >= 200 && status < 300) return true;
  return false;
}

/**
 * True when the sale should be written to the local queue (checkout) or retried later (sync).
 * - Transport: no HTTP response (offline, DNS, timeout, connection reset, failed to fetch).
 * - Transient server: 5xx including gateway errors (API down / unreachable behind proxy).
 * - 408 Request Timeout / 429 Too Many Requests: queue + retry (POS must not drop the sale).
 * - Not for other 4xx auth/validation/business responses.
 */
export function isRecoverableNetworkError(error) {
  if (!error) return false;

  const status = error.response?.status;
  if (status != null) {
    if (status === 408 || status === 429) return true;
    if (isNonRetryHttpStatus(status)) return false;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  const code = error.code;
  if (code && TRANSPORT_CODES.has(code)) return true;

  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("network error") || msg.includes("failed to fetch")) return true;
  if (msg.includes("networkerror")) return true;
  if (msg.includes("timeout")) return true;
  if (msg.includes("connection reset") || msg.includes("connection refused")) return true;
  if (msg.includes("dns") || msg.includes("getaddrinfo")) return true;
  if (error.isNetworkError === true) return true;

  return false;
}

/**
 * Coarse error bucket for UI and analytics (uses API `code` when present).
 */
export function classifyError(error) {
  if (!error?.response) return "NETWORK";

  const code = error.response.data?.code;

  if (code === "AUTH_REQUIRED") return "AUTH";
  if (code === "CONFLICT") return "CONFLICT";
  if (code === "INSUFFICIENT_STOCK") return "BUSINESS";

  return "UNKNOWN";
}
