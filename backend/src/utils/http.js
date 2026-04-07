function sendOk(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    status: "ok",
    data,
  });
}

function sendError(res, { statusCode = 500, code = "INTERNAL_ERROR", message, location, details, data }) {
  return res.status(statusCode).json({
    status: "error",
    code,
    message,
    ...(location ? { location } : {}),
    ...(details ? { details } : {}),
    ...(data ? { data } : {}),
  });
}

module.exports = { sendOk, sendError };
