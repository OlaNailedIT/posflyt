import axios from "axios";
import { API_BASE_URL } from "../config/apiBaseUrl";
import { clearSessionCookie, refreshAccessTokenSilently } from "./authRefresh";
import { useAuthStore } from "../stores/authStore";
import { useConflictStore } from "../stores/conflictStore";
import { useToastStore } from "../stores/toastStore";
import { getStoredAuthTokenSync } from "../utils/authToken";
import { showFriendlyErrorToast } from "../utils/friendlyApiError";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

function unwrap(data) {
  return data && data.status === "ok" && Object.prototype.hasOwnProperty.call(data, "data")
    ? data.data
    : data;
}

/**
 * Phase 2 Step 6 — `postTransaction` / `postTransactionReturn` must only run from
 * `executeFinancialEvent` (re-entrancy-safe depth counter).
 */
let _ufecFinancialApiDepth = 0;

/** @internal Used exclusively by executeFinancialEvent */
export function ufecFinancialApiEnter() {
  _ufecFinancialApiDepth += 1;
}

export function ufecFinancialApiExit() {
  _ufecFinancialApiDepth = Math.max(0, _ufecFinancialApiDepth - 1);
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
  return /\/auth\//.test(url) || url.includes("/staff/accept-invite");
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
      if (!isAuthRouteRequest(error.config) && !error.config?.skipGlobalToast) {
        showFriendlyErrorToast(error, (m, k) => useToastStore.getState().showToast(m, k));
      }
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
        error.response?.data?.message || "Credit feature is disabled.",
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
    if (status >= 500 && status < 600 && config && !isAuthRouteRequest(config) && !config?.skipGlobalToast) {
      showFriendlyErrorToast(error, (m, k) => useToastStore.getState().showToast(m, k));
      return Promise.reject(error);
    }
    // Session invalidation: only 401 (after refresh retry rules below). Never logout on generic network/5xx.
    if (status !== 401 || !config) {
      return Promise.reject(error);
    }

    const offlineOnly =
      useAuthStore.getState().offlineSessionActive && !useAuthStore.getState().token;
    if (offlineOnly && typeof navigator !== "undefined" && !navigator.onLine) {
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

export async function staffLoginRequest(phone, pin) {
  const { data } = await api.post("/auth/staff-login", { phone, pin });
  return unwrap(data);
}

export async function getAuthSession() {
  const { data } = await api.get("/auth/session");
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

/** Phase 7.11.4: server lookup by sanitized barcode (requires INVENTORY_COUNT_MODE). */
export async function getProductByBarcode(code) {
  const encoded = encodeURIComponent(String(code ?? "").trim());
  const { data } = await api.get(`/products/barcode/${encoded}`);
  return unwrap(data);
}

export async function postInventoryCountFinalize(body) {
  const { data } = await api.post("/inventory-count/finalize", body);
  return unwrap(data);
}

export async function postInventoryCountSessionEvent(body) {
  const { data } = await api.post("/inventory-count/session-event", body);
  return unwrap(data);
}

export async function postTransaction(payload) {
  if (_ufecFinancialApiDepth === 0 && import.meta.env.DEV) {
    console.warn("[UFEC_VIOLATION]", "Direct financial call bypass detected: postTransaction");
  }
  const { data } = await api.post("/transactions", payload, { timeout: 60_000 });
  return unwrap(data);
}

export async function getTransactions() {
  const { data } = await api.get("/transactions");
  return unwrap(data);
}

/** Server truth: `transaction.id` matches `client_transaction_id` for synced sales (recovery / support). */
export async function getTransactionByClientId(clientTransactionId) {
  const { data } = await api.get(`/transactions/${encodeURIComponent(clientTransactionId)}`);
  return unwrap(data);
}

/** Manager/admin: return of a paid sale (idempotent client_return_id; optional items for partial qty). */
export async function postTransactionReturn(body) {
  if (_ufecFinancialApiDepth === 0 && import.meta.env.DEV) {
    console.warn("[UFEC_VIOLATION]", "Direct financial call bypass detected: postTransactionReturn");
  }
  const { data } = await api.post("/transactions/return", body, { timeout: 60_000 });
  return unwrap(data);
}

/** Phase 7.12.1: download PDF with auth (same bytes as public link). */
export async function downloadTransactionReceiptPdf(transactionId) {
  const { data } = await api.get(`/transactions/${transactionId}/receipt`, {
    responseType: "blob",
    timeout: 60_000,
  });
  return data;
}

export async function getDashboardStats() {
  const { data } = await api.get("/dashboard-stats");
  return unwrap(data);
}

/** Daily Profit Engine — same data as dashboard-stats (net subtotals, COGS, gross & net profit). */
export async function getAnalyticsDailySummary() {
  const { data } = await api.get("/analytics/daily-summary");
  return unwrap(data);
}

export async function getSettings() {
  const { data } = await api.get("/settings", { skipGlobalToast: true });
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

/** Phase 7 — control tower: operational mode, resilience snapshot, anomalies, reconciliation backlog. */
export async function getAdminUfecHealth() {
  const { data } = await api.get("/api/admin/ufec-health");
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

/** Phase 7.10.1: apply payment against customer credit balance (admin). */
export async function postSettleCustomerCredit(customerId, payload) {
  const { data } = await api.post(`/customers/${encodeURIComponent(customerId)}/settle-credit`, payload);
  return unwrap(data);
}

/** Settle against a single sale row (admin). */
export async function postSettleTransactionCredit(transactionId, payload) {
  const { data } = await api.post(
    `/transactions/${encodeURIComponent(transactionId)}/settle-credit`,
    payload
  );
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
  const { data } = await api.get("/usage/features", { skipGlobalToast: true });
  return unwrap(data);
}

/** Phase 7.12.3: log WhatsApp receipt deep-link attempt (observability). */
export async function postWhatsAppReceiptAttempt(body) {
  const { data } = await api.post("/usage/whatsapp-receipt-attempt", body);
  return unwrap(data);
}

/** Phase 7.10.2: expenses (feature-gated server-side). */
export async function postExpense(payload) {
  const { data } = await api.post("/expenses", payload);
  return unwrap(data);
}

export async function getExpenses(params) {
  const { data } = await api.get("/expenses", { params });
  return unwrap(data);
}

export async function getDailySummary(params) {
  const { data } = await api.get("/reports/daily-summary", { params });
  return unwrap(data);
}

/** Phase 7.12.4: today’s sales metrics for owner summary (business timezone on Settings). */
export async function getOwnerDailySummary() {
  const { data } = await api.get("/reports/owner-daily-summary");
  return unwrap(data);
}

export async function getExpenseMeta() {
  const { data } = await api.get("/expenses/meta");
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

/** Append-only audit ledger ingest (batch). Actor is server-trusted from JWT. */
export async function postAuditEventsBulk(payload) {
  const { data } = await api.post("/audit-events/bulk", payload, { skipGlobalToast: true });
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

/** Phase 7.13.3: upload full IndexedDB snapshot (admin). */
export async function postIndexedDBBackup(snapshot) {
  const { data } = await api.post("/backups/indexeddb", { snapshot });
  return unwrap(data);
}

/** Download backup payload; use `snapshot` for INDEXEDDB restores. */
export async function downloadBackupPayload(backupId) {
  const { data } = await api.get(`/backups/${backupId}/download`);
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

export async function postStaffWhatsAppInvite(payload) {
  const { data } = await api.post("/staff/invite", payload);
  return unwrap(data);
}

export async function getStaffInvitePreview(token) {
  const { data } = await api.get(`/staff/invite/${encodeURIComponent(token)}`);
  return unwrap(data);
}

export async function postAcceptStaffInvite(body) {
  const { data } = await api.post("/staff/accept-invite", body);
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

/** Phase 6 admin — financial observability (integrity pipeline). */
export async function getObservabilitySummary() {
  const { data } = await api.get("/api/v1/obs/summary");
  return unwrap(data);
}

export async function getObservabilityHealth() {
  const { data } = await api.get("/api/v1/obs/health");
  return unwrap(data);
}

export async function getObservabilityAnomalies({ limit, deep } = {}) {
  const { data } = await api.get("/api/v1/obs/anomalies", {
    params: { limit, deep: deep ? "1" : undefined },
  });
  return unwrap(data);
}

export async function getObservabilityExplain(clientTransactionId) {
  const { data } = await api.get(
    `/api/v1/obs/transactions/${encodeURIComponent(clientTransactionId)}`
  );
  return unwrap(data);
}

/** Phase 6.5 — in-process financial event stream (recent ring buffer). */
export async function getStreamRecent(params = {}) {
  const { data } = await api.get("/api/v1/stream/recent", { params });
  return unwrap(data);
}

export async function getStreamStats() {
  const { data } = await api.get("/api/v1/stream/stats");
  return unwrap(data);
}

export default api;
