import axios from "axios";
import { API_BASE_URL } from "../config/apiBaseUrl";
import { clearSessionCookie, refreshAccessTokenSilently } from "./authRefresh";
import { useAuthStore } from "../stores/authStore";
import { useConflictStore } from "../stores/conflictStore";
import { useToastStore } from "../stores/toastStore";
import { getStoredAuthTokenSync } from "../utils/authToken";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

function unwrap(data) {
  return data && data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "data")
    ? data.data
    : data;
}

/** In-memory token first (fresh login), then `auth_token` / persisted Zustand. */
function resolveAuthToken() {
  const fromStore = useAuthStore.getState().token;
  if (fromStore) return fromStore;
  return getStoredAuthTokenSync();
}

/** Login/register failures: do not logout or retry. */
function isAuthRouteRequest(config) {
  const url = String(config?.url || "");
  return /\/auth\//.test(url);
}

function isRefreshRequest(config) {
  const url = String(config?.url || "");
  return url.includes("/auth/refresh");
}

function handleSessionExpired() {
  void clearSessionCookie();
  const { logout } = useAuthStore.getState();
  logout();
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path !== "/login" && path !== "/register") {
      useToastStore.getState().showToast("Your session has expired. Please sign in again.", "error");
      window.setTimeout(() => window.location.assign("/login"), 50);
    }
  }
}

api.interceptors.request.use((config) => {
  const token = resolveAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Stash last PUT JSON body so CONFLICT responses can retry with `force` (see ConflictResolutionHost). */
api.interceptors.request.use((config) => {
  const method = String(config.method || "").toLowerCase();
  if (method === "put" && config.data != null) {
    try {
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      config.__putBody = body && typeof body === "object" ? { ...body } : body;
    } catch {
      config.__putBody = null;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const rid = response.data?.requestId;
    if (rid != null) {
      response.requestId = rid;
    }
    return response;
  },
  async (error) => {
    const rid = error.response?.data?.requestId;
    if (rid != null) {
      error.requestId = rid;
    }
    if (!error.response) {
      error.isNetworkError = true;
      return Promise.reject(error);
    }

    const apiCode = error.response?.data?.code;
    if (apiCode === "CONFLICT") {
      const row = error.response.data?.data || {};
      const url = String(error.config?.url || "");
      const kind = url.includes("/customers/") ? "customer" : url.includes("/products/") ? "product" : null;
      const originalPayload = error.config?.__putBody;
      useConflictStore.getState().openConflict({
        ...row,
        originalPayload,
        kind,
      });
      useToastStore.getState().showToast(
        "This item was updated elsewhere. Please resolve the conflict.",
        "error"
      );
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const config = error.config;
    if (status === 429 || apiCode === "QUOTA_EXCEEDED") {
      useToastStore.getState().showToast(
        error.response?.data?.message || "Usage limit reached. Upgrade for more capacity.",
        "error"
      );
      return Promise.reject(error);
    }
    if (status === 403 && apiCode === "FEATURE_DISABLED") {
      useToastStore.getState().showToast(
        error.response?.data?.message || "This feature is not enabled for your plan.",
        "error"
      );
      return Promise.reject(error);
    }
    if (status === 402 || apiCode === "PAYMENT_REQUIRED") {
      useToastStore.getState().showToast(
        error.response?.data?.message || "Choose a plan to continue using this feature.",
        "error"
      );
      return Promise.reject(error);
    }
    if (status !== 401 || !config) {
      return Promise.reject(error);
    }

    if (isRefreshRequest(config)) {
      handleSessionExpired();
      return Promise.reject(error);
    }

    if (isAuthRouteRequest(config)) {
      return Promise.reject(error);
    }

    if (config._retryAfterRefresh) {
      handleSessionExpired();
      return Promise.reject(error);
    }

    const newToken = await refreshAccessTokenSilently();
    if (newToken) {
      config._retryAfterRefresh = true;
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${newToken}`;
      return api.request(config);
    }

    handleSessionExpired();
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
  const { data } = await api.post("/transactions", payload, { timeout: 60_000 });
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

export async function getAdminBillingOverview() {
  const { data } = await api.get("/admin/billing-overview");
  return unwrap(data);
}

export async function getAdminBillingWebhookEvents(params) {
  const { data } = await api.get("/admin/billing-webhook-events", { params });
  return unwrap(data);
}

export async function getAdminPaymentsQuery(params) {
  const { data } = await api.get("/admin/payments-query", { params });
  return unwrap(data);
}

export async function postAdminPaymentRetriesRun() {
  const { data } = await api.post("/admin/payment-retries/run");
  return unwrap(data);
}

export async function getAdminPaymentsReconcile() {
  const { data } = await api.get("/admin/payments/reconcile");
  return unwrap(data);
}

export async function postAdminPaymentsReconcileApply() {
  const { data } = await api.post("/admin/payments/reconcile/apply");
  return unwrap(data);
}

/** Phase 7.2: `/api/admin/*` monitoring (JWT + admin; read-only except optional alert test). */
export async function getAdminSyncSummary() {
  const { data } = await api.get("/api/admin/sync-summary");
  return unwrap(data);
}

export async function getAdminTransactions(params) {
  const { data } = await api.get("/api/admin/transactions", { params });
  return unwrap(data);
}

export async function getAdminTransaction(id) {
  const { data } = await api.get(`/api/admin/transactions/${encodeURIComponent(id)}`);
  return unwrap(data);
}

export async function getAdminEvents(params) {
  const { data } = await api.get("/api/admin/events", { params });
  return unwrap(data);
}

export async function getAdminEvent(id) {
  const { data } = await api.get(`/api/admin/events/${encodeURIComponent(id)}`);
  return unwrap(data);
}

export async function getAdminPayments(params) {
  const { data } = await api.get("/api/admin/payments", { params });
  return unwrap(data);
}

export async function getAdminWebhookEvents(params) {
  const { data } = await api.get("/api/admin/webhook-events", { params });
  return unwrap(data);
}

export async function getAdminOperationalErrors(params) {
  const { data } = await api.get("/api/admin/errors", { params });
  return unwrap(data);
}

export async function getAdminMonitoringAlerts() {
  const { data } = await api.get("/api/admin/monitoring-alerts");
  return unwrap(data);
}

export async function postAdminAlertTest(payload) {
  const { data } = await api.post("/api/admin/alerts/test", payload ?? {});
  return unwrap(data);
}

/** Phase 7.3: BI (BASIC+ plan, manager or admin). */
export async function getBiSnapshot(params) {
  const { data } = await api.get("/api/bi/snapshot", { params });
  return unwrap(data);
}

export async function getBiTransactions(params) {
  const { data } = await api.get("/api/bi/transactions", { params });
  return unwrap(data);
}

export async function getBiTransaction(id) {
  const { data } = await api.get(`/api/bi/transactions/${encodeURIComponent(id)}`);
  return unwrap(data);
}

export async function postBiSlackSummary(payload) {
  const { data } = await api.post("/api/bi/reports/slack-summary", payload ?? {});
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

export async function postCancelSubscription() {
  const { data } = await api.post("/billing/cancel");
  return unwrap(data);
}

export async function getBillingLifecycleEvents() {
  const { data } = await api.get("/billing/lifecycle-events");
  return unwrap(data);
}

export async function getBillingLifecycleMetrics() {
  const { data } = await api.get("/billing/lifecycle-metrics");
  return unwrap(data);
}

/** Phase 7.5: usage quotas, loyalty snapshot, upsell hints. */
export async function getUsageSummary() {
  const { data } = await api.get("/usage/summary");
  return unwrap(data);
}

/** Phase 7.5: resolved feature flags for current plan + A/B bucket. */
export async function getUsageFeatures() {
  const { data } = await api.get("/usage/features");
  return unwrap(data);
}

/** Phase 8: newsletter / lead capture (CRM hooks in ops). */
export async function postMarketingLead(payload) {
  const { data } = await api.post("/marketing/leads", payload);
  return unwrap(data);
}

export async function downloadBillingPaymentsCsv() {
  const response = await api.get("/billing/export/payments.csv", { responseType: "blob" });
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "payments.csv";
  a.click();
  URL.revokeObjectURL(url);
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
