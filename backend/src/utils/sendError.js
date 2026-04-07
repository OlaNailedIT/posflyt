/**
 * Standard error envelope: { status: "error", code, message, data }.
 * Optional `location` and `details` are merged into `data` for traceability.
 */
function sendError(res, { statusCode = 500, code = "INTERNAL_ERROR", message, location, details, data }) {
  const merged =
    data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
  if (location) merged.location = location;
  if (details !== undefined) merged.details = details;
  return res.status(statusCode).json({
    status: "error",
    code,
    message: message ?? "Error",
    data: merged,
  });
}

module.exports = sendError;
