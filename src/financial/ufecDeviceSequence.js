/**
 * Phase 4 Step 2 — Per-device monotonic sequence + stable device id (localStorage).
 * Avoids wall-clock-only ordering; pairs with ufecCanonicalOrder.js.
 */

const LS_DEVICE_ID = "ufec_device_id_v1";
const LS_SEQ = "ufec_device_sequence_counter_v1";

/**
 * Stable device identity (survives tab refresh; not session-scoped).
 * @returns {string}
 */
export function getUfecDeviceId() {
  if (typeof localStorage === "undefined") {
    return `mem_${crypto.randomUUID()}`;
  }
  try {
    let id = localStorage.getItem(LS_DEVICE_ID);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LS_DEVICE_ID, id);
    }
    return id;
  } catch {
    return `ephemeral_${crypto.randomUUID()}`;
  }
}

/**
 * Monotonic counter for FinancialEvent / queue rows on this device (never decreases).
 * @returns {number}
 */
export function getNextDeviceSequenceCounter() {
  if (typeof localStorage === "undefined") {
    return Date.now();
  }
  try {
    const s = localStorage.getItem(LS_SEQ);
    const n = (s ? parseInt(s, 10) : 0) + 1;
    localStorage.setItem(LS_SEQ, String(n));
    return n;
  } catch {
    return (Date.now() % 1e12) + Math.floor(Math.random() * 1e6);
  }
}
