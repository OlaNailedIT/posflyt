/**
 * Checkout primary button copy — affects perceived safety and retry discipline.
 * @param {string} status — from useCheckoutSessionStore
 * @param {string} defaultLabel — e.g. "Checkout" or Pay total
 */
export function checkoutPrimaryActionLabel(status, defaultLabel) {
  if (status === "pending") return "Processing payment…";
  if (status === "verifying") return "Verifying transaction…";
  if (status === "manual_verification_required") return "Still checking…";
  return defaultLabel;
}

/**
 * When to show animated / in-progress labels on the primary button.
 * `manual_verification_required` is excluded so the button can read "Checkout" while still allowing a new sale.
 * @param {string} status
 * @param {boolean} checkoutBusy — cart `checkoutLock` from cartStore
 */
export function checkoutShowWorkingLabel(status, checkoutBusy) {
  return checkoutBusy || status === "pending" || status === "verifying";
}

/**
 * Disable the checkout button only for `pending` (primary HTTP not settled in this session).
 * Do not block `verifying` or `manual_verification_required` — users must be able to start a new sale
 * (different cart intent) or rely on cart `checkoutLock` while a request is active.
 * @param {string} status
 */
export function checkoutSessionBlocksAction(status) {
  return status === "pending";
}
