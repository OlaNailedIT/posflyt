/**
 * Client-side JWT payload read (no signature verification).
 * Used only for scheduling proactive refresh before `exp`.
 */
function decodeJwtPayload(token) {
  const parts = String(token).split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export function getJwtExpMs(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
}
