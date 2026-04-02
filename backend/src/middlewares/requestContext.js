const { randomUUID } = require("crypto");

function requestContext(req, res, next) {
  const requestId = req.headers["x-request-id"] || randomUUID();
  req.requestId = String(requestId);
  res.setHeader("x-request-id", String(requestId));
  return next();
}

module.exports = { requestContext };
