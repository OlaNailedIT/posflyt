import bcrypt from "bcryptjs";
import { normalizePhoneDigits } from "../utils/phone";
import {
  loadOfflineStaffBundle,
  saveOfflineStaffBundle,
  saveOfflineSession,
} from "../offline/authOfflineStore";
import { offlineSessionExpiresAt } from "./sessionManager";
import { useAuthStore } from "../stores/authStore";

/**
 * @param {import("../offline/authOfflineStore").OfflineStaffPayload} payload
 * @param {string} phoneDigits
 */
export function userFromPayload(payload, phoneDigits) {
  return {
    id: payload.staffId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    business_id: payload.businessId,
    subscription_plan: payload.subscription_plan,
    phone: payload.phone || phoneDigits,
  };
}

/**
 * Verify PIN against encrypted local bundle and start offline session (no API).
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyOfflinePinAndLogin(phone, pin) {
  const digits = normalizePhoneDigits(phone);
  if (!digits || pin.length < 4) return { ok: false, reason: "invalid" };

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const bundle = await loadOfflineStaffBundle(digits);
  if (!bundle?.pinHash) return { ok: false, reason: "no_bundle" };

  const match = await bcrypt.compare(pin, bundle.pinHash);
  if (!match) return { ok: false, reason: "bad_pin" };

  const user = userFromPayload(bundle, digits);
  await saveOfflineSession({
    phone: digits,
    staffId: bundle.staffId,
    expiresAt: offlineSessionExpiresAt(),
  });

  useAuthStore.getState().login({
    user,
    token: null,
    offlineSessionActive: true,
  });

  if (typeof performance !== "undefined" && import.meta.env.DEV) {
    const ms = performance.now() - t0;
    if (ms > 300) {
      console.warn(`[offlineAuth] PIN verify took ${Math.round(ms)}ms (target <300ms)`);
    }
  }

  return { ok: true };
}

/**
 * After successful online staff login — persist bundle for offline PIN checks.
 * @param {object} apiData — unwrapped staff-login response
 */
export async function persistOfflineBundleFromStaffLogin(apiData) {
  const bundle = apiData.offlineBundle;
  const u = apiData.user;
  if (!bundle?.pinHash || !u?.id || !bundle.phone) return;

  /** @type {import("../offline/authOfflineStore").OfflineStaffPayload} */
  const payload = {
    pinHash: bundle.pinHash,
    staffId: bundle.staffId,
    phone: bundle.phone,
    role: bundle.role,
    businessId: bundle.businessId,
    storeId: bundle.storeId ?? null,
    name: u.name,
    email: u.email,
    subscription_plan: u.subscription_plan,
  };

  await saveOfflineStaffBundle(bundle.phone, payload);
  await saveOfflineSession({
    phone: bundle.phone,
    staffId: bundle.staffId,
    expiresAt: offlineSessionExpiresAt(),
  });
}
