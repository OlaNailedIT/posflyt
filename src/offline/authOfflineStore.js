import { openOfflineDatabase } from "../services/db";
import { encryptJson, decryptJson } from "./deviceCrypto";

const AUTH_STORE = "offline_staff_auth";
const SESS_STORE = "offline_session";

const SESSION_ROW_ID = "current";

/**
 * @typedef {object} OfflineStaffPayload
 * @property {string} pinHash
 * @property {string} staffId
 * @property {string} phone
 * @property {string} role
 * @property {string} businessId
 * @property {string|null} [storeId]
 * @property {string} name
 * @property {string} email
 * @property {string} subscription_plan
 */

/**
 * @param {string} phoneDigits
 * @param {OfflineStaffPayload} payload
 */
export async function saveOfflineStaffBundle(phoneDigits, payload) {
  const db = await openOfflineDatabase();
  const crypto = await encryptJson(payload);
  await db.put(AUTH_STORE, { phone: phoneDigits, ...crypto });
}

/**
 * @param {string} phoneDigits
 * @returns {Promise<OfflineStaffPayload|null>}
 */
export async function loadOfflineStaffBundle(phoneDigits) {
  try {
    const db = await openOfflineDatabase();
    const row = await db.get(AUTH_STORE, phoneDigits);
    if (!row?.iv || !row?.ciphertext) return null;
    return await decryptJson({ iv: row.iv, ciphertext: row.ciphertext });
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function hasOfflineStaffBundle(phoneDigits) {
  const b = await loadOfflineStaffBundle(phoneDigits);
  return Boolean(b?.pinHash);
}

/**
 * @param {{ phone: string, staffId: string, expiresAt: number }} meta
 */
export async function saveOfflineSession(meta) {
  const db = await openOfflineDatabase();
  await db.put(SESS_STORE, {
    id: SESSION_ROW_ID,
    phone: meta.phone,
    staffId: meta.staffId,
    expiresAt: meta.expiresAt,
    lastValidatedAt: Date.now(),
    status: "ACTIVE",
  });
}

/**
 * @returns {Promise<{ phone: string, staffId: string, expiresAt: number, lastValidatedAt: number }|null>}
 */
export async function getOfflineSession() {
  try {
    const db = await openOfflineDatabase();
    const row = await db.get(SESS_STORE, SESSION_ROW_ID);
    if (!row || row.expiresAt < Date.now()) return null;
    return row;
  } catch {
    return null;
  }
}

export async function clearOfflineSession() {
  try {
    const db = await openOfflineDatabase();
    await db.delete(SESS_STORE, SESSION_ROW_ID);
  } catch {
    // ignore
  }
}

export async function clearOfflineStaffAuth(phoneDigits) {
  try {
    const db = await openOfflineDatabase();
    await db.delete(AUTH_STORE, phoneDigits);
  } catch {
    // ignore
  }
}

/** Full sign-out: session + optional phone bundle removal */
export async function clearAllOfflineAuth(phoneDigits) {
  await clearOfflineSession();
  if (phoneDigits) await clearOfflineStaffAuth(phoneDigits);
}

export async function clearOfflineAuthForDevice() {
  try {
    const db = await openOfflineDatabase();
    await db.clear(AUTH_STORE);
    await db.clear(SESS_STORE);
  } catch {
    // ignore
  }
}
