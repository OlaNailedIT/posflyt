/**
 * Map API auth errors to user-facing copy (no stack traces or secrets).
 */
export function loginErrorMessage(err, fallback = "Could not sign in.") {
  const status = err.response?.status;
  const code = err.response?.data?.code;
  const message = err.response?.data?.message;
  if (code === "VALIDATION_FAILED") return message || "Please check your email and password.";
  if (status === 401) return "Invalid email or password.";
  if (message && status && status < 500) return message;
  return fallback;
}

export function registerErrorMessage(err, fallback = "Registration failed.") {
  const status = err.response?.status;
  const code = err.response?.data?.code;
  const message = err.response?.data?.message;
  if (code === "VALIDATION_FAILED") return message || "Please check the form and try again.";
  if (status === 409) return message || "That email is already registered.";
  if (message && status && status < 500) return message;
  return fallback;
}
