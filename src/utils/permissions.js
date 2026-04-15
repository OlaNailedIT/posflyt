const MAP = {
  ADMIN: {
    editProducts: true,
    viewReports: true,
    accessSettings: true,
    viewStaffAnalytics: true,
    processReturns: true,
  },
  MANAGER: {
    editProducts: true,
    viewReports: true,
    accessSettings: false,
    viewStaffAnalytics: true,
    processReturns: true,
  },
  CASHIER: {
    editProducts: false,
    viewReports: false,
    accessSettings: false,
    viewStaffAnalytics: false,
    processReturns: false,
  },
};

export function can(role, permission) {
  return Boolean(MAP[role]?.[permission]);
}
