const prisma = require("../config/prisma");
const { sendOk, sendError } = require("../utils/http");
const { pingRedis, isRedisConfigured } = require("../config/redis");
const { queueEnabled } = require("../config/env");

const PUBLIC_HEALTH_SERVICE_NAME = "posflyt-backend";

/**
 * Liveness: process is up. Does not check DB (use /ready for dependencies).
 */
function getHealth(req, res) {
  req.log?.info({ route: "/health" }, "Health check requested");
  return sendOk(res, {
    service: PUBLIC_HEALTH_SERVICE_NAME,
    status: "ok",
    uptimeSeconds: process.uptime(),
  });
}

/**
 * Readiness: DB + Redis when configured + queue expectations.
 */
async function getReady(req, res) {
  const checks = {
    database: false,
    redis: null,
    queueEnabled: Boolean(queueEnabled),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    req.log?.warn({ err }, "GET /ready database check failed");
    return sendError(res, {
      statusCode: 500,
      code: "NOT_READY",
      message: "Database not ready",
      data: { checks },
    });
  }

  if (isRedisConfigured()) {
    try {
      checks.redis = await pingRedis();
    } catch (e) {
      req.log?.warn({ err: e.message }, "GET /ready redis ping failed");
      checks.redis = false;
      return sendError(res, {
        statusCode: 500,
        code: "NOT_READY",
        message: "Redis not ready",
        data: { checks },
      });
    }
  }

  return sendOk(res, {
    service: PUBLIC_HEALTH_SERVICE_NAME,
    status: "ready",
    checks,
  });
}

module.exports = { getHealth, getReady };
