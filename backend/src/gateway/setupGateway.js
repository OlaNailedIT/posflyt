/**
 * Phase 9: API gateway layer — CORS, security headers, compression, gateway identification.
 * Request ID, logging, metrics, and rate limiting are applied in `app.js` before this (order matters).
 */
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { corsOrigin, nodeEnv } = require("../config/env");

function setupGateway(app) {
  const allowedOriginsList =
    corsOrigin === "*"
      ? true
      : corsOrigin
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOriginsList === true) return callback(null, true);
        if (Array.isArray(allowedOriginsList) && allowedOriginsList.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      exposedHeaders: ["x-request-id"],
    })
  );
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts:
        nodeEnv === "production"
          ? { maxAge: 15552000, includeSubDomains: true, preload: false }
          : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
    })
  );
  app.use(compression({ threshold: 1024 }));

  app.use((req, res, next) => {
    res.setHeader("X-Gateway-Layer", "posflyt-api");
    next();
  });
}

module.exports = { setupGateway };
