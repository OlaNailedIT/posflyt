/**
 * Standard success envelope: { status: "ok", requestId, data }.
 * `data` is usually an object or array; null/undefined becomes {}.
 */
function resRequestId(res) {
  const h = res.getHeader("x-request-id");
  return h != null ? String(h) : undefined;
}

function sendOk(res, data, statusCode = 200) {
  const body = data === undefined || data === null ? {} : data;
  return res.status(statusCode).json({
    status: "ok",
    requestId: resRequestId(res),
    data: body,
  });
}

module.exports = sendOk;
