import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { postTransaction } from "../services/api";
import { SYNC_STATUS } from "../constants/syncStatus";
import {
  enqueueOutbox,
  enqueueTransaction,
  getQueuedTransactions,
  resolveSyncStatus,
  upsertCustomerInCache,
} from "../services/db";
import { useCartStore } from "../stores/cartStore";
import { useProducts } from "../hooks/useProducts";
import { useOfflineStore } from "../stores/offlineStore";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useToastStore } from "../stores/toastStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatMoney } from "../utils/currency";
import { useCustomers } from "../hooks/useCustomers";
import ReceiptModal from "../components/pos/ReceiptModal";
import { calculateTaxTotal } from "../domain/tax";
import { isRecoverableNetworkError } from "../utils/networkError";

function buildCheckoutPayload({
  items,
  total,
  clientTransactionId,
  customerId,
  createdAt,
}) {
  return {
    client_transaction_id: clientTransactionId,
    created_at: createdAt,
    customer_id: customerId || undefined,
    payment_method: "CASH",
    items: items.map((item) => ({
      product_id: item.id,
      quantity: item.quantity,
    })),
    total,
  };
}

const card =
  "rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900";
const input =
  "w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";
const lineItem =
  "rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-950";

function TxSyncBadge({ row }) {
  const s = resolveSyncStatus(row);
  const styles = {
    [SYNC_STATUS.PENDING]: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-200",
    [SYNC_STATUS.SYNCING]: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
    [SYNC_STATUS.SYNCED]: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
    [SYNC_STATUS.FAILED]: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  };
  const labels = {
    [SYNC_STATUS.PENDING]: "Pending",
    [SYNC_STATUS.SYNCING]: "Syncing...",
    [SYNC_STATUS.SYNCED]: "Synced",
    [SYNC_STATUS.FAILED]: "Failed (Tap to retry)",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${styles[s] || styles[SYNC_STATUS.PENDING]}`}
    >
      {labels[s] || "Pending"}
    </span>
  );
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "", email: "" });
  const showToast = useToastStore((s) => s.showToast);
  const { data: products = [], isLoading } = useProducts();
  const { data: customers = [], addCustomer } = useCustomers();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const syncing = useOfflineStore((s) => s.syncing);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const { refreshCount, syncSingleTransaction } = useOfflineSync();
  const [localQueue, setLocalQueue] = useState([]);

  const loadLocalQueue = useCallback(async () => {
    const rows = await getQueuedTransactions();
    setLocalQueue(
      [...rows]
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 12)
    );
  }, []);

  useEffect(() => {
    void loadLocalQueue();
  }, [loadLocalQueue, pendingTransactions, failedTransactions, syncing]);

  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const removeFromCart = useCartStore((s) => s.removeFromCart);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);
  const settings = useSettingsStore((s) => s.settings);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  const subtotal = getTotal();
  const { rate: taxRate, taxAmount } = calculateTaxTotal(subtotal, settings);
  const total = subtotal + taxAmount;

  const onCheckout = async () => {
    if (!items.length) return;
    const clientTransactionId = crypto.randomUUID();
    const payload = buildCheckoutPayload({
      items,
      total,
      clientTransactionId,
      customerId: selectedCustomerId,
      createdAt: new Date().toISOString(),
    });

    setLoading(true);
    try {
      if (isOnline) {
        try {
          const response = await postTransaction(payload);
          const first = response.results?.[0];
          if (first?.status === "failed") {
            const messageByCode = {
              DUPLICATE_ID: "This sale was already recorded.",
              INVENTORY_CONFLICT: "Sale not saved: stock is no longer available.",
              VALIDATION_FAILED: "Sale data is invalid. Please retry checkout.",
              TRANSIENT_SYNC_FAILURE: "Temporary sync issue. Please try again in a moment.",
            };
            throw new Error(messageByCode[first.code] || first.message || "Checkout failed.");
          }
          const created = response.results?.find((r) => r.status === "created");
          if (created?.receipt) setReceipt(created.receipt);
          queryClient.invalidateQueries({ queryKey: ["products"] });
          showToast("Sale completed.", "success");
          clearCart();
        } catch (error) {
          if (isRecoverableNetworkError(error)) {
            await enqueueTransaction(payload);
            await refreshCount();
            await loadLocalQueue();
            showToast(
              "Connection unstable. Sale saved locally and will sync when the network is available.",
              "success"
            );
            clearCart();
          } else {
            showToast(error.message || "Checkout failed. Try again.", "error");
          }
        }
      } else {
        await enqueueTransaction(payload);
        await refreshCount();
        await loadLocalQueue();
        showToast("Saved offline. Will sync when you are back online.", "success");
        clearCart();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">POS</h1>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        How to use: add products to cart, select customer if needed, then tap Checkout.
      </p>
      <p className="mt-1 text-sm font-semibold text-teal-700 dark:text-teal-400">
        Works even when your internet is down.
      </p>
      {!isOnline && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Offline mode active. Sales are saved locally and will sync when internet returns.
        </p>
      )}
      {(pendingTransactions > 0 || failedTransactions > 0) && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          Queue: {pendingTransactions} active, {failedTransactions} failed.{" "}
          <Link to="/settings" className="underline">
            Open Sync Controls
          </Link>
        </p>
      )}

      {localQueue.length > 0 && (
        <div className={`${card} mt-4`}>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Local sale queue
          </h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Status for each sale saved on this device (including synced copies kept for visibility).
          </p>
          <ul className="mt-3 space-y-2">
            {localQueue.map((tx) => (
              <li
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700"
              >
                <div>
                  <p className="font-mono text-xs text-stone-500 dark:text-stone-400">
                    {(tx.client_transaction_id || tx.id).slice(0, 8)}…
                  </p>
                  <p className="text-sm text-stone-800 dark:text-stone-200">
                    {formatMoney(Number(tx.payload?.total ?? 0), settings.currencySymbol)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TxSyncBadge row={tx} />
                  {resolveSyncStatus(tx) === SYNC_STATUS.FAILED && (
                    <button
                      type="button"
                      className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 dark:border-red-700 dark:bg-stone-900 dark:text-red-200"
                      onClick={() =>
                        void syncSingleTransaction(tx).then(() => {
                          void loadLocalQueue();
                        })
                      }
                    >
                      Retry
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className={input}
          />
          {isLoading && (
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Loading products...</p>
          )}
          <div className="mt-3 grid gap-2">
            {!isLoading && filtered.length === 0 && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400">
                No products found. Add your first product in Inventory.
                <div className="mt-2">
                  <Link
                    to="/inventory"
                    className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Go to Inventory
                  </Link>
                </div>
              </div>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                className={`flex min-h-14 items-center justify-between ${lineItem} p-3 text-left text-base transition hover:border-teal-300 hover:bg-teal-50 dark:hover:border-teal-700 dark:hover:bg-stone-800`}
              >
                <span>{p.name}</span>
                <span className="font-semibold text-teal-800 dark:text-teal-400">
                  {formatMoney(p.price, settings.currencySymbol)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={card}>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Cart</h2>
          <div className="mt-3 space-y-2 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700">
            <label className="text-sm">Customer (optional)</label>
            <select
              className={input}
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              <option value="">Walk-in customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.phone}
                </option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className={input}
                placeholder="Name"
                value={quickCustomer.name}
                onChange={(e) => setQuickCustomer((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className={input}
                placeholder="Phone"
                value={quickCustomer.phone}
                onChange={(e) => setQuickCustomer((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <input
                className={input}
                placeholder="Email"
                type="email"
                value={quickCustomer.email}
                onChange={(e) => setQuickCustomer((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
              onClick={async () => {
                if (!quickCustomer.name || !quickCustomer.phone) return;
                if (isOnline) {
                  try {
                    const created = await addCustomer.mutateAsync(quickCustomer);
                    setSelectedCustomerId(created.id);
                    setQuickCustomer({ name: "", phone: "", email: "" });
                    showToast("Customer added for checkout.", "success");
                  } catch {
                    showToast("Could not add customer.", "error");
                  }
                  return;
                }
                const id = crypto.randomUUID();
                const body = {
                  id,
                  name: quickCustomer.name.trim(),
                  phone: quickCustomer.phone.trim(),
                };
                if (quickCustomer.email.trim()) {
                  body.email = quickCustomer.email.trim();
                }
                await enqueueOutbox({ kind: "POST_CUSTOMER", body });
                await upsertCustomerInCache({
                  id,
                  name: body.name,
                  phone: body.phone,
                  email: body.email || null,
                });
                await refreshCount();
                await queryClient.invalidateQueries({ queryKey: ["customers"] });
                setSelectedCustomerId(id);
                setQuickCustomer({ name: "", phone: "", email: "" });
                showToast("Customer saved offline. Will sync when you are back online.", "success");
              }}
            >
              Add Customer
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <div key={item.id} className={`${lineItem} p-2.5`}>
                <div className="flex items-center justify-between">
                  <span>{item.name}</span>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                    onClick={() => removeFromCart(item.id)}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-stone-300 px-3 py-1 text-base dark:border-stone-600"
                    onClick={() => setQuantity(item.id, item.quantity - 1)}
                  >
                    -
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    className="rounded border border-stone-300 px-3 py-1 text-base dark:border-stone-600"
                    onClick={() => setQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                  <span className="ml-auto font-medium">
                    {formatMoney(item.quantity * item.price, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {taxRate > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 text-sm dark:border-stone-700">
              <span>Tax ({taxRate.toFixed(2)}%)</span>
              <span>
                {formatMoney(taxAmount, settings.currencySymbol)}
              </span>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 dark:border-stone-700">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-xl font-black text-teal-800 dark:text-teal-400">
              {formatMoney(total, settings.currencySymbol)}
            </span>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            disabled={!items.length || loading}
            className="mt-3 w-full rounded-lg bg-teal-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            {loading ? "Processing..." : "Checkout"}
          </button>
        </div>
      </div>
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </section>
  );
}
