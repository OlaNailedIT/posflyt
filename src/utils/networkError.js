/**
 * True when the request never reached the server (offline, timeout, DNS, etc.).
 * Used to fall back to offline queue for critical mutations.
 */
export function isRecoverableNetworkError(error) {
  if (!error || error.response) return false;
  const code = error.code;
  const msg = String(error.message || "").toLowerCase();
  if (code === "ERR_NETWORK" || code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  if (msg.includes("network error") || msg.includes("failed to fetch")) return true;
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
