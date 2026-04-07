const Redis = require("ioredis");
const { redisUrl } = require("./env");
const { logger } = require("../utils/logger");

let client;
let connectAttempted = false;

function isRedisConfigured() {
  return Boolean(redisUrl && redisUrl.length > 5);
}

function getRedisClient() {
  if (!isRedisConfigured()) return null;
  if (client) return client;
  if (connectAttempted) return null;
  connectAttempted = true;
  try {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      logger.warn({ err: err.message }, "redis client error");
    });
    return client;
  } catch (e) {
    logger.error({ err: e.message }, "redis init failed");
    return null;
  }
}

async function pingRedis() {
  const c = getRedisClient();
  if (!c) {
    throw new Error("Redis client unavailable");
  }
  const pong = await c.ping();
  return pong === "PONG";
}

async function quitRedis() {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    client = null;
  }
}

module.exports = {
  getRedisClient,
  isRedisConfigured,
  pingRedis,
  quitRedis,
};
