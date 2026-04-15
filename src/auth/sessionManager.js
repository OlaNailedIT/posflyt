/** Unlocked session without re-entering PIN (device trust window). */
export const OFFLINE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function offlineSessionExpiresAt() {
  return Date.now() + OFFLINE_SESSION_TTL_MS;
}
