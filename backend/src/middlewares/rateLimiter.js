const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { getRedisClient, isRedisConfigured } = require("../config/redis");
const { logger } = require("../utils/logger");

const WINDOW_MS = 60 * 1000;

/**
 * Redis-backed store when REDIS_URL is set (shared across instances); otherwise memory.
 */
function createLimiterOptions({ max, prefix }) {
  const base = {
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  };

  if (!isRedisConfigured()) {
    logger.info({ store: "memory", prefix }, "rate limiter using in-memory store");
    return base;
  }

  const redis = getRedisClient();
  if (!redis) {
    logger.warn({ prefix }, "REDIS_URL set but Redis client unavailable — using memory rate limiter");
    return base;
  }

  const sendCommand = (...args) => redis.call(...args);

  try {
    const store = new RedisStore({
      sendCommand,
      prefix: prefix || "rl:",
    });
    logger.info({ store: "redis", prefix: prefix || "rl:" }, "rate limiter using Redis store");
    return { ...base, store };
  } catch (e) {
    logger.error({ err: e.message, prefix }, "Redis rate limit store init failed — falling back to memory");
    return base;
  }
}

const apiLimiter = rateLimit(createLimiterOptions({ max: 120, prefix: "rl:api:" }));
const authLimiter = rateLimit(createLimiterOptions({ max: 10, prefix: "rl:auth:" }));

module.exports = { apiLimiter, authLimiter };
