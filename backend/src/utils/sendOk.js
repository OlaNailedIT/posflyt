/**
 * Standard success envelope: { status: "ok", data }.
 * `data` is usually an object or array; null/undefined becomes {}.
 */
function sendOk(res, data, statusCode = 200) {
  const body = data === undefined || data === null ? {} : data;
  return res.status(statusCode).json({
    status: "ok",
    data: body,
  });
}

module.exports = sendOk;
