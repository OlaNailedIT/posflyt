import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postProduct, putProduct } from "../services/api";
import { useProducts } from "../hooks/useProducts";
import { useToastStore } from "../stores/toastStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatMoney } from "../utils/currency";

const emptyForm = {
  name: "",
  sellingPrice: "",
  costPrice: "",
  stock: "",
  lowStockThreshold: "10",
  barcode: "",
};

const field =
  "rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const { data: products = [], isLoading, isError } = useProducts();
  const settings = useSettingsStore((s) => s.settings);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

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
      setForm(emptyForm);
      showToast("Product updated.", "success");
    },
    onError: (err) => {
      showToast(err.response?.data?.message || "Could not update product.", "error");
    },
  });

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sellingPrice: String(p.sellingPrice ?? p.price),
      costPrice: String(p.costPrice ?? 0),
      stock: String(p.stock),
      lowStockThreshold: String(p.lowStockThreshold ?? 10),
      barcode: p.barcode || "",
    });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      sellingPrice: Number(form.sellingPrice),
      price: Number(form.sellingPrice),
      costPrice: Number(form.costPrice || 0),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold || 10),
    };
    if (form.barcode.trim()) body.barcode = form.barcode.trim();

    if (editingId) {
      updateMutation.mutate({ id: editingId, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <section>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Inventory</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Add products before using POS. Stock updates automatically when sales are completed.
      </p>

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
          <input
            className={field}
            placeholder="Selling price"
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
            placeholder="Stock"
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            required
          />
          <input
            className={field}
            placeholder="Low stock threshold"
            type="number"
            min="1"
            step="1"
            value={form.lowStockThreshold}
            onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
            required
          />
          <input
            className={`${field} sm:col-span-2`}
            placeholder="Barcode (optional)"
            value={form.barcode}
            onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
          />
        </div>
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
        {!!products.length && (
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Product</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Sell</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Cost</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Stock</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Threshold</th>
                <th className="p-3 font-semibold text-stone-700 dark:text-stone-300">Barcode</th>
                <th className="w-28 p-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-stone-200 dark:border-stone-700">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{formatMoney(p.sellingPrice ?? p.price, settings.currencySymbol)}</td>
                  <td className="p-3">{formatMoney(p.costPrice ?? 0, settings.currencySymbol)}</td>
                  <td
                    className={`p-3 font-semibold ${Number(p.stock) <= Number(p.lowStockThreshold || 10) ? "text-amber-700 dark:text-amber-400" : ""}`}
                  >
                    {p.stock}
                  </td>
                  <td className="p-3">{p.lowStockThreshold ?? 10}</td>
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
