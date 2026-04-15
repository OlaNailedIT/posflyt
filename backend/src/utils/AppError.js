/**
 * Typed API errors (code + HTTP status) for consistent handlers.
 */
class AppError extends Error {
  /**
   * @param {string} code Machine-readable code (e.g. INVALID_EXPENSE_AMOUNT)
   * @param {string} [message] Human-readable message (defaults to code)
   * @param {number} [statusCode] HTTP status (default 400)
   */
  constructor(code, message, statusCode = 400) {
    super(message || code);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { AppError };
