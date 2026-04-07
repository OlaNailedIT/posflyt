import { Link } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomers } from "../hooks/useCustomers";
import { useToastStore } from "../stores/toastStore";
import { useConflictStore } from "../stores/conflictStore";

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: customers = [], addCustomer, editCustomer, isLoading } = useCustomers();
  const showToast = useToastStore((s) => s.showToast);
  const pendingConflictIds = useConflictStore((s) => s.pendingConflictIds);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [editBaselineUpdatedAt, setEditBaselineUpdatedAt] = useState(null);

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
            lastKnownUpdatedAt: baseline ? String(baseline) : new Date().toISOString(),
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
          : new Date().toISOString()
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
                {pendingConflictIds[c.id] === "customer" && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    Conflict
                  </span>
                )}
              </span>
            </h2>
            <p className="mt-1 text-teal-700 dark:text-teal-400">{c.email || "No email"}</p>
            <button
              type="button"
              onClick={() => startEdit(c)}
              className="mt-2 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Edit
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
