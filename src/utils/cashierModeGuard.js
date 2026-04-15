import { USER_MODE } from "../config/userMode";

/**
 * @param {string} dashboardMode
 * @param {string} componentName
 */
export function warnIfCashierShowsFinancial(dashboardMode, componentName) {
  if (!import.meta.env.DEV) return;
  if (dashboardMode === USER_MODE.CASHIER) {
    console.warn(
      `[Cashier mode] Financial or intelligence component mounted: "${componentName}". This should not appear in cashier UI.`
    );
  }
}
