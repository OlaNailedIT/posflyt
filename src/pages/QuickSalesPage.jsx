import { Link, Navigate } from "react-router-dom";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUsageFeatures, postTransaction } from "../services/api";
import { enqueueTransaction } from "../services/db";
import { useCartStore } from "../stores/cartStore";
import { useProducts } from "../hooks/useProducts";
import { useOfflineStore } from "../stores/offlineStore";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useToastStore } from "../stores/toastStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatMoney } from "../utils/currency";
import ReceiptModal from "../components/pos/ReceiptModal";
import { calculateTaxTotal } from "../domain/tax";
import { buildCheckoutPayload } from "../domain/posCheckout";
import { isRecoverableNetworkError } from "../utils/networkError";

function unitLabel(unitType) {
  const u = unitType || "unit";
  if (u === "kg") return "kg";
  if (u === "litre") return "L";
  return "";
}

function formatShelfPrice(p, symbol) {
  const u = p.unitType || "unit";
  if (u === "unit") return formatMoney(p.price, symbol);
  const rate = p.pricePerUnit ?? p.price;
  return `${formatMoney(rate, symbol)}/${u === "kg" ? "kg" : "L"}`;
}

const payBtn =
  "flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border-2 border-stone-300 bg-white px-2 py-3 text-center text-base font-bold shadow-sm transition hover:border-teal-500 hover:bg-teal-50 dark:border-stone-600 dark:bg-stone-900 dark:hover:border-teal-600 dark:hover:bg-stone-800";
const payBtnActive =
  "border-teal-600 bg-teal-50 ring-2 ring-teal-500 dark:border-teal-500 dark:bg-teal-950/40";
const productTile =
  "flex min-h-[7rem] flex-col items-stretch justify-between rounded-2xl border-2 border-stone-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.98] dark:border-stone-600 dark:bg-stone-900";

export default function QuickSalesPage() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const quickOn = usageFeatures?.flags?.QUICK_SALES_MODE !== false;

  const { data: products = [], isLoading } = useProducts();
  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings.currencySymbol || "$";

  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const removeFromCart = useCartStore((s) => s.removeFromCart);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);

  const [query, setQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [measureModal, setMeasureModal] = useState(null);

  const isOnline = useOfflineStore((s) => s.isOnline);
  const { refreshCount } = useOfflineSync();

  const orderedProducts = useMemo(() => {
    const ids = settings.quickSalesProductIds;
    const pin = Array.isArray(ids) ? ids : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const pinned = pin.map((id) => byId.get(id)).filter(Boolean);
    const rest = products.filter((p) => !pin.includes(p.id));
    return [...pinned, ...rest];
  }, [products, settings.quickSalesProductIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedProducts;
    return orderedProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [orderedProducts, query]);

  const subtotal = getTotal();
  const { rate: taxRate, taxAmount } = calculateTaxTotal(subtotal, settings);
  const total = subtotal + taxAmount;

  const onPay = async () => {
    if (!items.length) {
      showToast("Add items to the cart first.", "error");
      return;
    }
    const checkoutStarted = performance.now();
    const clientTransactionId = crypto.randomUUID();
    const syncEventId = crypto.randomUUID();
    const prepMs = Math.round(performance.now() - checkoutStarted);
    const payload = buildCheckoutPayload({
      items,
      total,
      clientTransactionId,
      customerId: undefined,
      createdAt: new Date().toISOString(),
      creditMode: false,
      creditOption: "full",
      eventId: syncEventId,
      splitPayments: undefined,
      defaultPaymentMethod: paymentMethod,
      checkoutSource: "quick",
      clientDurationMs: prepMs,
    });

    setLoading(true);
    try {
      if (isOnline) {
        try {
          const response = await postTransaction(payload);
          const first = response.results?.[0];
          if (first?.status === "failed") {
            const messageByCode = {
              INSUFFICIENT_STOCK: "Not enough stock.",
              INVALID_ITEM_QUANTITY: "Invalid quantity for one or more items.",
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
            showToast("Saved offline — will sync when online.", "success");
            clearCart();
          } else {
            showToast(error.message || "Checkout failed.", "error");
          }
        }
      } else {
        await enqueueTransaction(payload);
        await refreshCount();
        showToast("Saved offline — will sync when online.", "success");
        clearCart();
      }
    } finally {
      setLoading(false);
    }
  };

  const onProductTap = useCallback(
    (p) => {
      const isMeasured = p.unitType && p.unitType !== "unit";
      if (isMeasured) {
        setMeasureModal({ product: p, quantityInput: "1" });
      } else {
        addToCart(p);
      }
    },
    [addToCart]
  );

  if (!quickOn) {
    return <Navigate to="/pos" replace />;
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-3 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-stone-100">Quick sale</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">One screen — tap products, pay, done.</p>
        </div>
        <Link
          to="/pos"
          className="rounded-xl border-2 border-stone-300 bg-stone-100 px-4 py-2.5 text-sm font-bold text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        >
          Full POS
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search products…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-2xl border-2 border-stone-300 bg-white px-4 py-3 text-base dark:border-stone-600 dark:bg-stone-950"
      />

      {isLoading && <p className="text-sm text-stone-500">Loading products…</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <button key={p.id} type="button" className={productTile} onClick={() => onProductTap(p)}>
            <span className="line-clamp-2 text-lg font-bold leading-tight text-stone-900 dark:text-stone-100">
              {p.name}
            </span>
            <span className="text-sm font-semibold text-teal-700 dark:text-teal-400">
              {formatShelfPrice(p, symbol)}
            </span>
          </button>
        ))}
      </div>

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">No products match. Try Inventory to add stock.</p>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-stone-200 bg-white/95 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
        <div className="mx-auto max-w-5xl space-y-3">
          {items.length > 0 && (
            <ul className="max-h-24 space-y-1 overflow-y-auto text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-stone-800 dark:text-stone-200">{item.name}</span>
                  <div className="flex items-center gap-2">
                    {(item.unitType || "unit") !== "unit" ? (
                      <input
                        type="number"
                        min="0.001"
                        step="0.01"
                        className="w-20 rounded border border-stone-300 px-1 py-0.5 text-right dark:border-stone-600 dark:bg-stone-950"
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.id, e.target.value)}
                      />
                    ) : (
                      <span>×{item.quantity}</span>
                    )}
                    <button
                      type="button"
                      className="text-xs font-bold text-red-600"
                      onClick={() => removeFromCart(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-2 dark:border-stone-700">
            <div>
              <p className="text-xs text-stone-500">Total</p>
              <p className="text-2xl font-black text-teal-800 dark:text-teal-300">
                {formatMoney(total, symbol)}
              </p>
              {taxRate > 0 && (
                <p className="text-[10px] text-stone-500">
                  Incl. tax {formatMoney(taxAmount, symbol)} ({taxRate.toFixed(1)}%)
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-stone-500">Payment</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: "CASH", label: "Cash" },
                { id: "CARD", label: "Card" },
                { id: "TRANSFER", label: "Transfer" },
                { id: "MOBILE", label: "Mobile" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${payBtn} ${paymentMethod === m.id ? payBtnActive : ""}`}
                  onClick={() => setPaymentMethod(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={loading || !items.length}
            onClick={() => void onPay()}
            className="w-full rounded-2xl bg-teal-600 py-4 text-xl font-black text-white shadow-lg hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            {loading ? "Processing…" : `Pay ${formatMoney(total, symbol)}`}
          </button>
        </div>
      </div>

      {measureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-stone-900">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Quantity ({unitLabel(measureModal.product.unitType)})
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{measureModal.product.name}</p>
            <input
              type="number"
              min="0.001"
              step="0.01"
              className="mt-3 w-full rounded-xl border-2 border-stone-300 p-3 dark:border-stone-600 dark:bg-stone-950"
              value={measureModal.quantityInput}
              onChange={(e) => setMeasureModal((m) => (m ? { ...m, quantityInput: e.target.value } : m))}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-stone-300 px-4 py-2 dark:border-stone-600"
                onClick={() => setMeasureModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-teal-600 px-4 py-2 font-bold text-white"
                onClick={() => {
                  const q = Number(measureModal.quantityInput);
                  if (!Number.isFinite(q) || q <= 0) {
                    showToast("Enter a quantity greater than zero.", "error");
                    return;
                  }
                  addToCart(measureModal.product, { quantity: q });
                  setMeasureModal(null);
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
