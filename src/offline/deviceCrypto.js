const DEVICE_KEY = "posflyt_device_id_v1";

export function getOrCreateDeviceId() {
  if (typeof localStorage === "undefined") return `anon_${crypto.randomUUID()}`;
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function deriveAesKey() {
  const id = getOrCreateDeviceId();
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(id), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("posflyt-offline-auth-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * @param {object} obj — JSON-serializable
 * @returns {Promise<{ iv: number[], ciphertext: number[] }>}
 */
export async function encryptJson(obj) {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ct)),
  };
}

/**
 * @param {{ iv: number[], ciphertext: number[] }} payload
 * @returns {Promise<object>}
 */
export async function decryptJson(payload) {
  const key = await deriveAesKey();
  const iv = new Uint8Array(payload.iv);
  const raw = new Uint8Array(payload.ciphertext);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, raw);
  return JSON.parse(new TextDecoder().decode(buf));
}
