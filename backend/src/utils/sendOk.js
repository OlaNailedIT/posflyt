/**
 * Standard success envelope: { status: "ok", requestId, data }.
 * `data` is usually an object or array; null/undefined becomes {}.
 */
function resRequestId(res) {
  const h = res.getHeader("x-request-id");
  return h != null ? String(h) : undefined;
}

function sendOk(res, data, statusCode = 200, envelope = undefined) {
  const body = data === undefined || data === null ? {} : data;
  const code = typeof statusCode === "number" ? statusCode : 200;
  const extra =
    envelope && typeof envelope === "object" && !Array.isArray(envelope) ? envelope : {};
  return res.status(code).json({
    status: "ok",
    requestId: resRequestId(res),
    data: body,
    ...extra,
  });
}

module.exports = sendOk;
