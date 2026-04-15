const { normalizeDatesForJson } = require("../utils/date");

/**
 * Ensures `res.json` payloads serialize dates as ISO strings (invalid Date → null).
 * Does not mutate the original body; runs after controllers / sendOk.
 */
function responseDateSanitizer(req, res, next) {
  const originalJson = res.json;
  res.json = function sanitizedJson(body) {
    let payload = body;
    if (body !== null && body !== undefined && typeof body === "object") {
      payload = normalizeDatesForJson(body);
    }
    return originalJson.call(this, payload);
  };
  next();
}

module.exports = responseDateSanitizer;
