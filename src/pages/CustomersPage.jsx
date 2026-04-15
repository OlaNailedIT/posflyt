import { Link } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCustomers } from "../hooks/useCustomers";
import { useToastStore } from "../stores/toastStore";
import { useConflictStore } from "../stores/conflictStore";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getUsageFeatures, postSettleCustomerCredit } from "../services/api";
import { enqueueOutbox } from "../services/db";
import { formatMoney } from "../utils/currency";
import { useOfflineStore } from "../stores/offlineStore";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { nowISOString } from "../utils/safeDate";

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: customers = [], addCustomer, editCustomer, isLoading } = useCustomers();
  const showToast = useToastStore((s) => s.showToast);
  const pendingConflictIds = useConflictStore((s) => s.pendingConflictIds);
  const role = useAuthStore((s) => s.user?.role);
  const currencySymbol = useSettingsStore((s) => s.settings?.currencySymbol || "$");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [editBaselineUpdatedAt, setEditBaselineUpdatedAt] = useState(null);
  const [settleForId, setSettleForId] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");
  const settleRequestIdRef = useRef(null);
  const settleCustomer = useMemo(
    () => customers.find((c) => c.id === settleForId),
    [customers, settleForId]
  );

  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const creditFeatureOn = Boolean(usageFeatures?.flags?.CREDIT_SALES);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const { refreshCount: refreshSyncCount } = useOfflineSync();

  const settleMutation = useMutation({
    mutationFn: ({ id, amount, requestId }) =>
      postSettleCustomerCredit(id, { amount, request_id: requestId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      showToast("Payment recorded.", "success");
      setSettleForId(null);
      setSettleAmount("");
    },
    onError: (e) => {
      showToast(e.response?.data?.message || "Could not record payment.", "error");
    },
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const baseline =
          editBaselineUpdatedAt ||
          customers.find((c) => c.id === editingId)?.updatedAt ||
          customers.find((c) => c.id === editingId)?.createdAt;
        await editCustomer.mutateAsync({
          id: editingId,
          payload: {
            ...form,
            lastKnownUpdatedAt: baseline ? String(baseline) : nowISOString(),
          },
        });
        showToast("Customer updated.", "success");
      } else {
        await addCustomer.mutateAsync(form);
        showToast("Customer added.", "success");
      }
      setEditingId(null);
      setEditBaselineUpdatedAt(null);
      setForm({ name: "", phone: "", email: "" });
    } catch (error) {
      if (error.response?.data?.code === "CONFLICT") {
        void queryClient.invalidateQueries({ queryKey: ["customers"] });
        return;
      }
      showToast(error.response?.data?.message || "Could not save customer.", "error");
    }
  };

  const startEdit = (customer) => {
    setEditingId(customer.id);
    setEditBaselineUpdatedAt(
      customer.updatedAt
        ? String(customer.updatedAt)
        : customer.createdAt
          ? String(customer.createdAt)
          : nowISOString()
    );
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
    });
  };

  return (
    <section>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Customers</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Save customer details so you can link buyers to sales and track repeat visits.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-4 max-w-xl rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-stone-300 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-950"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-stone-300 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-950"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-stone-300 bg-stone-50 p-2.5 sm:col-span-2 dark:border-stone-600 dark:bg-stone-950"
            placeholder="Email (optional)"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
          >
            {editingId ? "Update Customer" : "Add Customer"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditBaselineUpdatedAt(null);
                setForm({ name: "", phone: "", email: "" });
              }}
              className="rounded-lg border border-stone-300 px-4 py-2 dark:border-stone-600"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {isLoading && <p className="mt-3 text-sm text-stone-500">Loading customers...</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {!isLoading && customers.length === 0 && (
          <div className="md:col-span-3 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
            You haven&apos;t added any customers yet. Add your first customer to attach them at checkout.
            <div className="mt-2">
              <Link to="/pos" className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">
                Go to POS checkout
              </Link>
            </div>
          </div>
        )}
        {customers.map((c) => (
          <article
            key={c.id}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <p className="text-sm text-stone-500 dark:text-stone-400">{c.phone || "No phone"}</p>
            <h2 className="mt-1 font-semibold text-stone-900 dark:text-stone-100">
              <span className="inline-flex flex-wrap items-center gap-2">
                {c.name}
                {creditFeatureOn && Number(c.totalOutstanding || 0) > 0 && (
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    ⚠️ Owes {formatMoney(Number(c.totalOutstanding), currencySymbol)}
                  </span>
                )}
                {pendingConflictIds[c.id] === "customer" && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    Conflict
                  </span>
                )}
              </span>
            </h2>
            <p className="mt-1 text-teal-700 dark:text-teal-400">{c.email || "No email"}</p>
            {creditFeatureOn && Number(c.totalOutstanding || 0) > 0 && (
              <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                Total outstanding:{" "}
                <span className="text-amber-800 dark:text-amber-300">
                  {formatMoney(Number(c.totalOutstanding || 0), currencySymbol)}
                </span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startEdit(c)}
                className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Edit
              </button>
              {creditFeatureOn && role === "ADMIN" && Number(c.totalOutstanding || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    settleRequestIdRef.current = crypto.randomUUID();
                    setSettleForId(c.id);
                    setSettleAmount(String(Number(c.totalOutstanding || 0).toFixed(2)));
                  }}
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Settle payment
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {settleForId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settle-title"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-4 shadow-lg dark:border-stone-700 dark:bg-stone-900">
            <h2 id="settle-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Record payment
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Apply a payment against this customer&apos;s outstanding balance.
            </p>
            <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-200">
              Outstanding:{" "}
              {formatMoney(Number(settleCustomer?.totalOutstanding || 0), currencySymbol)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium dark:border-stone-600"
                onClick={() => {
                  const o = Number(settleCustomer?.totalOutstanding || 0);
                  setSettleAmount(String(o.toFixed(2)));
                }}
              >
                Pay full
              </button>
              <button
                type="button"
                className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium dark:border-stone-600"
                onClick={() => {
                  const o = Number(settleCustomer?.totalOutstanding || 0);
                  setSettleAmount(String((o / 2).toFixed(2)));
                }}
              >
                Pay half
              </button>
            </div>
            <label className="mt-3 block text-sm text-stone-700 dark:text-stone-300">
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-950"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
                onClick={() => {
                  setSettleForId(null);
                  setSettleAmount("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                disabled={settleMutation.isPending}
                onClick={async () => {
                  const amt = Number(settleAmount);
                  if (!Number.isFinite(amt) || amt <= 0) {
                    showToast("Enter a valid amount.", "error");
                    return;
                  }
                  if (!isOnline) {
                    try {
                      await enqueueOutbox({
                        kind: "SETTLE_CUSTOMER_CREDIT",
                        body: {
                          customer_id: settleForId,
                          amount: amt,
                          request_id: settleRequestIdRef.current,
                        },
                      });
                      await refreshSyncCount();
                      showToast("Payment queued. Will sync when you are back online.", "success");
                      setSettleForId(null);
                      setSettleAmount("");
                    } catch {
                      showToast("Could not queue payment.", "error");
                    }
                    return;
                  }
                  settleMutation.mutate({
                    id: settleForId,
                    amount: amt,
                    requestId: settleRequestIdRef.current,
                  });
                }}
              >
                {settleMutation.isPending ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
