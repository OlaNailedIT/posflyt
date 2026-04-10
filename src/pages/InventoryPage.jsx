import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUsageFeatures, postProduct, putProduct } from "../services/api";
import { enqueueOutbox, upsertProductInCache } from "../services/db";
import { useProducts } from "../hooks/useProducts";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { useOfflineStore } from "../stores/offlineStore";
import { useToastStore } from "../stores/toastStore";
import { useConflictStore } from "../stores/conflictStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAuthStore } from "../stores/authStore";
import { can } from "../utils/permissions";
import { formatMoney } from "../utils/currency";

const emptyForm = {
  name: "",
  unitType: "unit",
  sellingPrice: "",
  costPrice: "",
  stock: "",
  lowStockThreshold: "",
  barcode: "",
};

function isLowStockRow(p) {
  const t = p.lowStockThreshold;
  if (t == null || Number(t) <= 0) return false;
  return Number(p.stock) <= Number(t);
}

const field =
  "rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const { refreshCount } = useOfflineSync();
  const { data: products = [], isLoading, isError } = useProducts();
  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const weightedInventory = usageFeatures?.flags?.WEIGHTED_PRODUCTS !== false;
  const lowStockAlertsOn = usageFeatures?.flags?.LOW_STOCK_ALERTS !== false;
  const inventoryCountModeOn = usageFeatures?.flags?.INVENTORY_COUNT_MODE !== false;
  const role = useAuthStore((s) => s.user?.role);
  const settings = useSettingsStore((s) => s.settings);
  const pendingConflictIds = useConflictStore((s) => s.pendingConflictIds);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  /** ISO string from server when edit started; required for optimistic concurrency on PUT. */
  const [editBaselineUpdatedAt, setEditBaselineUpdatedAt] = useState(null);

  const filterLow = searchParams.get("filter") === "low_stock" && lowStockAlertsOn;
  const focusId = searchParams.get("focus") || undefined;

  const tableRows = useMemo(() => {
    if (!filterLow) return products;
    return products.filter(isLowStockRow);
  }, [products, filterLow]);

  useEffect(() => {
    if (!focusId) return;
    const t = window.setTimeout(() => {
      const row = document.querySelector(`[data-product-row="${focusId.replace(/"/g, "")}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusId, tableRows]);

  const createMutation = useMutation({
    mutationFn: (body) => postProduct(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setForm(emptyForm);
      showToast("Product created.", "success");
    },
    onError: (err) => {
      showToast(err.response?.data?.message || "Could not create product.", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => putProduct(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setEditingId(null);
      setEditBaselineUpdatedAt(null);
      setForm(emptyForm);
      showToast("Product updated.", "success");
    },
    onError: (err) => {
      if (err.response?.data?.code === "CONFLICT") {
        void queryClient.invalidateQueries({ queryKey: ["products"] });
        return;
      }
      showToast(err.response?.data?.message || "Could not update product.", "error");
    },
  });

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditBaselineUpdatedAt(
      p.updatedAt ? String(p.updatedAt) : p.createdAt ? String(p.createdAt) : new Date().toISOString()
    );
    const ut = p.unitType || "unit";
    setForm({
      name: p.name,
      unitType: ut,
      sellingPrice: String(ut !== "unit" ? (p.pricePerUnit ?? p.price) : (p.sellingPrice ?? p.price)),
      costPrice: String(p.costPrice ?? 0),
      stock: String(p.stock),
      lowStockThreshold: p.lowStockThreshold != null && Number(p.lowStockThreshold) > 0 ? String(p.lowStockThreshold) : "",
      barcode: p.barcode || "",
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const ut = form.unitType || "unit";
    const rate = Number(form.sellingPrice);
    const body = {
      name: form.name.trim(),
      unitType: ut,
      costPrice: Number(form.costPrice || 0),
      stock: Number(form.stock),
      lowStockThreshold:
        form.lowStockThreshold === "" || form.lowStockThreshold == null
          ? null
          : Number(form.lowStockThreshold),
    };
    if (ut === "unit") {
      body.sellingPrice = rate;
      body.price = rate;
    } else {
      body.pricePerUnit = rate;
      body.price = rate;
      body.sellingPrice = rate;
    }
    if (form.barcode.trim()) body.barcode = form.barcode.trim();

    if (editingId) {
      const baseline =
        editBaselineUpdatedAt ||
        products.find((x) => x.id === editingId)?.updatedAt ||
        products.find((x) => x.id === editingId)?.createdAt;
      body.lastKnownUpdatedAt = baseline ? String(baseline) : new Date().toISOString();
    }

    if (isOnline) {
      if (editingId) {
        updateMutation.mutate({ id: editingId, body });
      } else {
        createMutation.mutate(body);
      }
      return;
    }

    if (editingId) {
      await enqueueOutbox({
        kind: "PUT_PRODUCT",
        body,
        meta: { productId: editingId },
      });
      const prev = products.find((p) => p.id === editingId) || {};
      await upsertProductInCache({
        ...prev,
        ...body,
        id: editingId,
        unitType: body.unitType,
        pricePerUnit: body.pricePerUnit ?? null,
      });
    } else {
      const id = crypto.randomUUID();
      const fullBody = { ...body, id };
      await enqueueOutbox({ kind: "POST_PRODUCT", body: fullBody });
      await upsertProductInCache({
        id,
        name: fullBody.name,
        price: fullBody.price,
        sellingPrice: fullBody.sellingPrice,
        costPrice: fullBody.costPrice,
        stock: fullBody.stock,
        lowStockThreshold: fullBody.lowStockThreshold,
        barcode: fullBody.barcode || null,
        unitType: fullBody.unitType || "unit",
        pricePerUnit: fullBody.pricePerUnit ?? null,
      });
    }
    await refreshCount();
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    showToast("Saved offline. Will sync when you are back online.", "success");
    setForm(emptyForm);
    setEditingId(null);
    setEditBaselineUpdatedAt(null);
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <section>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Inventory</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Add products before using POS. Stock updates automatically when sales are completed.
      </p>
      {filterLow && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-medium">Low-stock filter on.</span>{" "}
          <button
            type="button"
            className="text-teal-800 underline dark:text-teal-400"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("filter");
              next.delete("focus");
              setSearchParams(next);
            }}
          >
            Show all products
          </button>
        </div>
      )}
      {inventoryCountModeOn && can(role, "editProducts") && (
        <p className="mt-2 text-sm">
          <Link
            to="/inventory/count"
            className="font-medium text-teal-700 underline dark:text-teal-400"
          >
            Barcode inventory count
          </Link>
          <span className="text-stone-500 dark:text-stone-400"> — fast physical counts with a scanner.</span>
        </p>
      )}
      {!isOnline && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          You are offline. Product changes are saved on this device and will sync when you are back online.
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-xl rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          {editingId ? "Edit product" : "Add product"}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className={`${field} sm:col-span-2`}
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          {weightedInventory && (
            <select
              className={field}
              value={form.unitType}
              onChange={(e) => setForm((f) => ({ ...f, unitType: e.target.value }))}
              aria-label="Unit type"
            >
              <option value="unit">By unit (each)</option>
              <option value="kg">By weight (kg)</option>
              <option value="litre">By volume (litre)</option>
            </select>
          )}
          <input
            className={field}
            placeholder={
              form.unitType === "kg"
                ? "Price per kg"
                : form.unitType === "litre"
                  ? "Price per litre"
                  : "Selling price"
            }
            type="number"
            min="0"
            step="0.01"
            value={form.sellingPrice}
            onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
            required
          />
          <input
            className={field}
            placeholder="Cost price"
            type="number"
            min="0"
            step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
            required
          />
          <input
            className={field}
            placeholder={form.unitType !== "unit" ? "Stock (kg or L)" : "Stock"}
            type="number"
            min="0"
            step={form.unitType !== "unit" ? "0.001" : "1"}
            value={form.stock}
            onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            required
          />
          <input
            className={field}
            placeholder="Low stock alert (optional)"
            type="number"
            min="0"
            step="0.001"
            value={form.lowStockThreshold}
            onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
            title="Leave empty to disable low-stock alerts for this product"
          />
          <input
            className={`${field} sm:col-span-2`}
            placeholder="Barcode (optional)"
            value={form.barcode}
            onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
          />
        </div>
        {lowStockAlertsOn && (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Low stock threshold: optional. When set, the dashboard and alerts trigger when stock is at or below this
            level.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add product"}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded-lg border border-stone-300 px-4 py-2 text-stone-800 dark:border-stone-600 dark:text-stone-200"
              onClick={() => {
                setEditingId(null);
                setEditBaselineUpdatedAt(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
        {isLoading && (
          <p className="p-4 text-sm text-stone-500 dark:text-stone-400">Loading products…</p>
        )}
        {isError && (
          <p className="p-4 text-sm text-amber-800 dark:text-amber-400">Could not load products.</p>
        )}
        {!isLoading && !!products.length && filterLow && !tableRows.length && (
          <p className="p-4 text-sm text-amber-800 dark:text-amber-300">
            No products are currently at or below their low-stock threshold.
            <button
              type="button"
              className="ml-2 font-medium text-teal-700 underline dark:text-teal-400"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("filter");
                next.delete("focus");
                setSearchParams(next);
              }}
            >
              Clear filter
            </button>
          </p>
        )}
        {!isLoading && !products.length && (
          <div className="p-4 text-sm text-stone-500 dark:text-stone-400">
            <p>You haven&apos;t added any products yet. Start by adding your first product.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                Add first product
              </button>
              <Link
                to="/onboarding"
                className="rounded border border-stone-300 px-3 py-1.5 text-xs font-semibold dark:border-stone-600"
              >
                View setup guide
              </Link>
            </div>
          </div>
        )}
        {!!tableRows.length && (
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Product</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Unit</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Sell</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Cost</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Stock</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Low stock</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Barcode</th>
                <th className="w-28 p-3" />
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr
                  key={p.id}
                  data-product-row={p.id}
                  className={`border-t border-stone-200 dark:border-stone-700 ${focusId === p.id ? "ring-2 ring-inset ring-amber-400 dark:ring-amber-500" : ""}`}
                >
                  <td className="p-3 font-medium">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {p.name}
                      {pendingConflictIds[p.id] === "product" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950/50 dark:text-red-400">
                          Conflict
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="p-3 text-stone-600 dark:text-stone-400">
                    {(p.unitType || "unit") === "unit"
                      ? "Each"
                      : p.unitType === "kg"
                        ? "kg"
                        : "L"}
                  </td>
                  <td className="p-3">
                    {(p.unitType || "unit") === "unit"
                      ? formatMoney(p.sellingPrice ?? p.price, settings.currencySymbol)
                      : `${formatMoney(p.pricePerUnit ?? p.price, settings.currencySymbol)}/${p.unitType === "kg" ? "kg" : "L"}`}
                  </td>
                  <td className="p-3">{formatMoney(p.costPrice ?? 0, settings.currencySymbol)}</td>
                  <td
                    className={`p-3 font-semibold ${lowStockAlertsOn && isLowStockRow(p) ? "text-amber-700 dark:text-amber-400" : ""}`}
                  >
                    {p.stock}
                  </td>
                  <td className="p-3 text-stone-600 dark:text-stone-400">
                    {p.lowStockThreshold != null && Number(p.lowStockThreshold) > 0 ? p.lowStockThreshold : "—"}
                  </td>
                  <td className="p-3 text-stone-500 dark:text-stone-400">{p.barcode || "—"}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
