const { randomUUID } = require("crypto");

function attachRequestId(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

module.exports = { attachRequestId };
