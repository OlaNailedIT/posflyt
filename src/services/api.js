import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
});

function unwrap(data) {
  return data && data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "data")
    ? data.data
    : data;
}

api.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      const { logout } = useAuthStore.getState();
      logout();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export async function loginRequest(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return unwrap(data);
}

export async function registerRequest(payload) {
  const { data } = await api.post("/auth/register", payload);
  return unwrap(data);
}

export async function getProducts() {
  const { data } = await api.get("/products");
  return unwrap(data);
}

export async function postProduct(body) {
  const { data } = await api.post("/products", body);
  return unwrap(data);
}

export async function putProduct(id, body) {
  const { data } = await api.put(`/products/${id}`, body);
  return unwrap(data);
}

export async function postTransaction(payload) {
  const { data } = await api.post("/transactions", payload);
  return unwrap(data);
}

export async function getDashboardStats() {
  const { data } = await api.get("/dashboard-stats");
  return unwrap(data);
}

export async function getSettings() {
  const { data } = await api.get("/settings");
  return unwrap(data);
}

export async function putSettings(payload) {
  const { data } = await api.put("/settings", payload);
  return unwrap(data);
}

export async function getAdminSalesFeed() {
  const { data } = await api.get("/admin/sales-feed");
  return unwrap(data);
}
export async function getAdminMetrics() {
  const { data } = await api.get("/admin/metrics");
  return unwrap(data);
}
export async function getReliabilitySummary() {
  const { data } = await api.get("/system/reliability-summary");
  return unwrap(data);
}
export async function getAdminDailyCloseStatus() {
  const { data } = await api.get("/admin/daily-close");
  return unwrap(data);
}
export async function postAdminDailyClose() {
  const { data } = await api.post("/admin/daily-close");
  return unwrap(data);
}

export async function getCustomers() {
  const { data } = await api.get("/customers");
  return unwrap(data);
}

export async function postCustomer(payload) {
  const { data } = await api.post("/customers", payload);
  return unwrap(data);
}

export async function putCustomer(id, payload) {
  const { data } = await api.put(`/customers/${id}`, payload);
  return unwrap(data);
}

export async function getSalesReport(params) {
  const { data } = await api.get("/reports/sales", { params });
  return unwrap(data);
}

export async function exportCsv(type) {
  const response = await api.get(`/exports/${type}`, {
    responseType: "blob",
  });
  return response.data;
}

export async function getProfitAnalytics() {
  const { data } = await api.get("/analytics/profit");
  return unwrap(data);
}

export async function getStaffPerformance() {
  const { data } = await api.get("/analytics/staff-performance");
  return unwrap(data);
}

export async function getSmartAlerts() {
  const { data } = await api.get("/analytics/smart-alerts");
  return unwrap(data);
}

export async function getInsights() {
  const { data } = await api.get("/analytics/insights");
  return unwrap(data);
}

export async function getOnboardingStatus() {
  const { data } = await api.get("/onboarding/status");
  return unwrap(data);
}

export async function markOnboardingActive() {
  const { data } = await api.post("/onboarding/active");
  return unwrap(data);
}

export async function getForecast() {
  const { data } = await api.get("/analytics/forecast");
  return unwrap(data);
}
export async function getForecastDataset() {
  const { data } = await api.get("/analytics/forecast-dataset");
  return unwrap(data);
}

export async function getSalesOptimization() {
  const { data } = await api.get("/analytics/sales-optimization");
  return unwrap(data);
}

export async function getSubscription() {
  const { data } = await api.get("/billing/subscription");
  return unwrap(data);
}

export async function createCheckoutSession(payload) {
  const { data } = await api.post("/billing/checkout-session", payload);
  return unwrap(data);
}

export async function confirmBillingPayment(payload) {
  const { data } = await api.post("/billing/confirm", payload);
  return unwrap(data);
}

export async function getPaymentHistory() {
  const { data } = await api.get("/billing/payment-history");
  return unwrap(data);
}

export async function getAuditLogs() {
  const { data } = await api.get("/audit-logs");
  return unwrap(data);
}

export async function triggerBackup() {
  const { data } = await api.post("/backups/trigger");
  return unwrap(data);
}

export async function getBackups() {
  const { data } = await api.get("/backups");
  return unwrap(data);
}

export async function getRecoveryInfo() {
  const { data } = await api.get("/backups/recovery-info");
  return unwrap(data);
}

export async function logoutAllDevices() {
  const { data } = await api.post("/sessions/logout-all");
  return unwrap(data);
}

export async function getSystemHealth() {
  const { data } = await api.get("/system/health");
  return unwrap(data);
}

export async function getHelpContent() {
  const { data } = await api.get("/help-content");
  return unwrap(data);
}

export async function reportIssue(payload) {
  const { data } = await api.post("/issues/report", payload);
  return unwrap(data);
}

export async function getStaff() {
  const { data } = await api.get("/staff");
  return unwrap(data);
}

export async function postStaff(payload) {
  const { data } = await api.post("/staff", payload);
  return unwrap(data);
}

export async function disableStaff(id) {
  const { data } = await api.post(`/staff/${id}/disable`);
  return unwrap(data);
}

export async function reactivateStaff(id, payload) {
  const { data } = await api.post(`/staff/${id}/reactivate`, payload);
  return unwrap(data);
}

export default api;
