const MAP = {
  ADMIN: {
    editProducts: true,
    viewReports: true,
    accessSettings: true,
    viewStaffAnalytics: true,
  },
  MANAGER: {
    editProducts: true,
    viewReports: true,
    accessSettings: false,
    viewStaffAnalytics: true,
  },
  CASHIER: {
    editProducts: false,
    viewReports: false,
    accessSettings: false,
    viewStaffAnalytics: false,
  },
};

export function can(role, permission) {
  return Boolean(MAP[role]?.[permission]);
}
