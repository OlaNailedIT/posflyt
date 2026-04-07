import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOfflineStore } from "../stores/offlineStore";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useSettings } from "../hooks/useSettings";
import { useToastStore } from "../stores/toastStore";
import ExpandableSection from "../components/ui/ExpandableSection";
import { VALIDATION_MODE } from "../config/productMode";
import { useReliabilitySummary } from "../hooks/useSystem";
import { clearAllQueues } from "../services/db";

const currencyOptions = [
  { code: "USD", symbol: "$" },
  { code: "NGN", symbol: "₦" },
  { code: "GBP", symbol: "£" },
  { code: "EUR", symbol: "€" },
  { code: "KES", symbol: "KSh" },
  { code: "ZAR", symbol: "R" },
];
const countryOptions = [
  { code: "US", label: "United States" },
  { code: "NG", label: "Nigeria" },
  { code: "GB", label: "United Kingdom" },
  { code: "KE", label: "Kenya" },
  { code: "ZA", label: "South Africa" },
];

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export default function SettingsPage() {
  const { data, isLoading, updateSettings, isSaving } = useSettings();
  const [form, setForm] = useState({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    countryCode: "US",
    currencyCode: "USD",
    currencySymbol: "$",
    taxEnabled: false,
    taxRate: 0,
    taxRules: [{ countryCode: "US", enabled: false, rate: 0 }],
    logoUrl: "",
    receiptLayout: "STANDARD",
  });
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const lastSyncError = useOfflineStore((s) => s.lastSyncError);
  const lastSyncCode = useOfflineStore((s) => s.lastSyncCode);
  const queueLastAttemptAt = useOfflineStore((s) => s.queueLastAttemptAt);
  const queueNextRetryAt = useOfflineStore((s) => s.queueNextRetryAt);
  const queueReplayOrder = useOfflineStore((s) => s.queueReplayOrder);
  const syncing = useOfflineStore((s) => s.syncing);
  const syncProgress = useOfflineStore((s) => s.syncProgress);
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt);
  const lastSuccessfulSyncAt = useOfflineStore((s) => s.lastSuccessfulSyncAt);
  const { syncQueue } = useOfflineSync();
  const { data: reliability } = useReliabilitySummary(true);
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    if (!data) return;
    setForm({
      businessName: data.businessName || "",
      businessEmail: data.businessEmail || "",
      businessPhone: data.businessPhone || "",
      countryCode: data.countryCode || "US",
      currencyCode: data.currencyCode || "USD",
      currencySymbol: data.currencySymbol || "$",
      taxEnabled: Boolean(data.taxEnabled),
      taxRate: Number(data.taxRate || 0),
      taxRules: Array.isArray(data.taxRules)
        ? data.taxRules
        : [{ countryCode: data.countryCode || "US", enabled: Boolean(data.taxEnabled), rate: Number(data.taxRate || 0) }],
      logoUrl: data.logoUrl || "",
      receiptLayout: data.receiptLayout || "STANDARD",
    });
  }, [data]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const onLogoUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setField("logoUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const onCurrencyChange = (code) => {
    const selected = currencyOptions.find((c) => c.code === code);
    setForm((prev) => ({
      ...prev,
      currencyCode: code,
      currencySymbol: selected?.symbol || prev.currencySymbol,
    }));
  };
  const selectedTaxRule =
    form.taxRules.find((r) => r.countryCode === form.countryCode) || {
      countryCode: form.countryCode,
      enabled: Boolean(form.taxEnabled),
      rate: Number(form.taxRate || 0),
    };
  const setSelectedTaxRule = (patch) => {
    const next = form.taxRules.filter((r) => r.countryCode !== form.countryCode);
    next.push({ ...selectedTaxRule, ...patch, countryCode: form.countryCode });
    setField("taxRules", next);
    if (patch.enabled !== undefined) setField("taxEnabled", Boolean(patch.enabled));
    if (patch.rate !== undefined) setField("taxRate", Number(patch.rate || 0));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateSettings({
        ...form,
        taxRate: Number(form.taxRate || 0),
        businessPhone: form.businessPhone || "",
        taxRules: form.taxRules,
      });
      showToast("Settings updated.", "success");
    } catch (error) {
      const msg = error.response?.data?.message || "Could not update settings.";
      showToast(msg, "error");
    }
  };

  const onSyncNow = async () => {
    if (!isOnline) return;
    await syncQueue(true);
  };
  const syncSummary = `POSflyt Sync Update: Pending ${pendingTransactions}, Failed ${failedTransactions}, Duplicates prevented ${reliability?.failureCohorts?.byCode?.DUPLICATE_ID || 0}, Last synced ${lastSuccessfulSyncAt != null ? new Date(lastSuccessfulSyncAt).toLocaleString() : lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "Not yet"}, Reconciliation: ${reliability?.lastReconciliationStatus || "Unknown"}.`;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Settings</h1>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Keep your business data consistent, stock accurate, and sync recoverable in low-internet conditions.
      </p>
      {isLoading && <p className="text-sm text-stone-500 dark:text-stone-400">Loading settings...</p>}
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Business Information</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            These details appear in receipts and business records.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <input
              className={inputClass}
              placeholder="Business name"
              value={form.businessName}
              onChange={(e) => setField("businessName", e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Business email"
              type="email"
              value={form.businessEmail}
              onChange={(e) => setField("businessEmail", e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Business phone"
              value={form.businessPhone}
              onChange={(e) => setField("businessPhone", e.target.value)}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Currency Settings</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Used in POS and dashboard totals.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <select
              className={inputClass}
              value={form.currencyCode}
              onChange={(e) => onCurrencyChange(e.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code}
                </option>
              ))}
            </select>
            <input className={inputClass} value={form.currencySymbol} readOnly />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Tax Settings</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Enable tax and set the rate used during checkout.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedTaxRule.enabled}
                onChange={(e) => setSelectedTaxRule({ enabled: e.target.checked })}
              />
              Enable tax
            </label>
            <input
              className={inputClass}
              style={{ maxWidth: 220 }}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={selectedTaxRule.rate}
              onChange={(e) => setSelectedTaxRule({ rate: Number(e.target.value || 0) })}
              disabled={!selectedTaxRule.enabled}
            />
          </div>
        </div>

        <ExpandableSection title="Advanced options" className="mt-1">
          <p className="text-xs">Branding and country-specific tax options are secondary during validation.</p>
          {!VALIDATION_MODE && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                className={inputClass}
                value={form.countryCode}
                onChange={(e) => setField("countryCode", e.target.value)}
              >
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Logo URL"
                value={form.logoUrl}
                onChange={(e) => setField("logoUrl", e.target.value)}
              />
              <input
                className={`${inputClass} sm:col-span-2`}
                type="file"
                accept="image/*"
                onChange={(e) => onLogoUpload(e.target.files?.[0])}
              />
              <select
                className={inputClass}
                value={form.receiptLayout}
                onChange={(e) => setField("receiptLayout", e.target.value)}
              >
                <option value="STANDARD">Standard receipt layout</option>
                <option value="COMPACT">Compact receipt layout</option>
              </select>
            </div>
          )}
          {VALIDATION_MODE && <p className="mt-2 text-xs">Coming later.</p>}
        </ExpandableSection>

        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Offline Control Panel</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Use Sync Now to send queued offline sales and other pending changes when internet is available.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`rounded px-2 py-1 ${isOnline ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}
            >
              {isOnline ? "Online" : "Offline"}
            </span>
            <span>Pending sync items: {pendingTransactions}</span>
            <span>Failed syncs: {failedTransactions}</span>
            <span>Duplicates prevented: {reliability?.failureCohorts?.byCode?.DUPLICATE_ID || 0}</span>
            {syncing && syncProgress.total > 0 && (
              <span>
                Sync progress: {syncProgress.done}/{syncProgress.total}
              </span>
            )}
            <span>Your data is saved locally and backed up when sync completes.</span>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={!isOnline || syncing || pendingTransactions === 0}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(syncSummary);
                showToast("Sync summary copied.", "success");
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
            >
              Copy summary
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Reset all pending sync data? This clears queued sales and offline product/customer changes.")) {
                  return;
                }
                try {
                  await clearAllQueues();
                  showToast("Sync queues cleared. Reloading…", "success");
                  window.setTimeout(() => window.location.reload(), 300);
                } catch {
                  showToast("Could not reset sync data.", "error");
                }
              }}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
            >
              Reset sync data
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {queueReplayOrder} {queueLastAttemptAt ? `Last retry: ${new Date(queueLastAttemptAt).toLocaleString()}.` : ""}
            {queueNextRetryAt ? ` Next retry: ${new Date(queueNextRetryAt).toLocaleString()}.` : ""}
          </p>
          {failedTransactions > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {lastSyncCode === "INSUFFICIENT_STOCK" ||
              lastSyncCode === "INVENTORY_CONFLICT" ||
              lastSyncError?.toLowerCase().includes("stock unavailable")
                ? "Some sales failed due to stock conflict. Update stock, then tap Sync Now."
                : lastSyncCode === "VALIDATION_FAILED"
                  ? "Some sales need correction. Re-open POS and resubmit the failed sale."
                : "Some sales failed to sync. Keep this page open and tap Sync Now after checking your connection."}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={!isOnline || syncing}
                  className="rounded bg-amber-600 px-2.5 py-1 text-white disabled:opacity-60"
                >
                  Retry Sync
                </button>
                <Link to="/inventory" className="rounded border border-amber-600 px-2.5 py-1">
                  Review inventory
                </Link>
              </div>
            </div>
          )}
          <ExpandableSection title="What to do if sync fails" className="mt-3">
            <ul className="space-y-1 text-xs">
              <li>- Sync failed: Check internet status, then tap Sync Now.</li>
              <li>- Stock mismatch: Review Inventory low-stock/conflicts, then retry sync.</li>
              <li>- Offline all day: Keep selling; queue saves locally and syncs later.</li>
            </ul>
          </ExpandableSection>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </section>
  );
}
