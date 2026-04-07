const { getRedisClient, isRedisConfigured } = require("../config/redis");
const { cacheTtlSeconds } = require("../config/env");
const { logger } = require("../utils/logger");

const memory = new Map();

/**
 * Phase 9: distributed cache with in-process fallback (BI snapshots, feature flags, etc.).
 */
async function getCache(key) {
  if (isRedisConfigured()) {
    const r = getRedisClient();
    if (r) {
      const raw = await r.get(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  return null;
}

async function setCache(key, value, ttlSeconds = cacheTtlSeconds) {
  const payload = JSON.stringify(value);
  if (isRedisConfigured()) {
    const r = getRedisClient();
    if (r) {
      await r.set(key, payload, "EX", ttlSeconds);
      return;
    }
  }
  memory.set(key, { val: value, exp: Date.now() + ttlSeconds * 1000 });
}

async function delCache(key) {
  if (isRedisConfigured()) {
    const r = getRedisClient();
    if (r) await r.del(key);
  }
  memory.delete(key);
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} factory
 * @param {number} [ttlSeconds]
 */
async function wrapCache(key, factory, ttlSeconds = cacheTtlSeconds) {
  const hit = await getCache(key);
  if (hit !== null) return hit;
  try {
    const data = await factory();
    await setCache(key, data, ttlSeconds);
    return data;
  } catch (err) {
    logger.warn({ err: err.message, key }, "cache factory failed");
    throw err;
  }
}

module.exports = { getCache, setCache, delCache, wrapCache };
