/**
 * Map API auth errors to user-facing copy (no stack traces or secrets).
 */
function withDevRequestRef(message, err) {
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return message;
  const ref = err?.requestId ?? err?.response?.data?.requestId;
  if (!ref) return message;
  return `${message} Ref: ${ref}`;
}

export function loginErrorMessage(err, fallback = "Could not sign in.") {
  const status = err.response?.status;
  const code = err.response?.data?.code;
  const message = err.response?.data?.message;
  let out = fallback;
  if (code === "VALIDATION_FAILED") out = message || "Please check your email and password.";
  else if (status === 401) out = "Invalid email or password.";
  else if (message && status && status < 500) out = message;
  return withDevRequestRef(out, err);
}

export function registerErrorMessage(err, fallback = "Registration failed.") {
  const status = err.response?.status;
  const code = err.response?.data?.code;
  const message = err.response?.data?.message;
  let out = fallback;
  if (code === "VALIDATION_FAILED") out = message || "Please check the form and try again.";
  else if (status === 409) out = message || "That email is already registered.";
  else if (message && status && status < 500) out = message;
  return withDevRequestRef(out, err);
}
