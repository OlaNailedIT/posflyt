import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import FeatureGate from "../components/FeatureGate";
import { enqueueOutbox } from "../services/db";
import { getExpenses, postExpense } from "../services/api";
import { useOfflineStore } from "../stores/offlineStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { formatMoney } from "../utils/currency";
import { DEFAULT_EXPENSE_CATEGORIES } from "../config/expenseCategories";
import { nowISOString, safeToISOString } from "../utils/safeDate";

const CATEGORY_OTHER = "other";

function labelCategory(c) {
  if (!c) return "";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

const CATEGORY_SELECT_OPTIONS = [
  ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: labelCategory(c) })),
  { value: CATEGORY_OTHER, label: "Other" },
];

function utcTodayRangeIso() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return {
    from: safeToISOString(from) ?? nowISOString(),
    to: safeToISOString(to) ?? nowISOString(),
  };
}

function formatCategoryDisplay(cat) {
  if (!cat) return "";
  return cat
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatExpenseTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ExpensesPage() {
  const currencySymbol = useSettingsStore((s) => s.settings.currencySymbol);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const showToast = useToastStore((s) => s.showToast);
  const queryClient = useQueryClient();
  const amountRef = useRef(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(DEFAULT_EXPENSE_CATEGORIES[0] || "transport");
  const [categoryCustom, setCategoryCustom] = useState("");
  const [note, setNote] = useState("");

  const range = utcTodayRangeIso();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", range.from, range.to],
    queryFn: () =>
      getExpenses({
        from: range.from,
        to: range.to,
      }),
    enabled: isOnline,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (!isOnline) {
        await enqueueOutbox({
          kind: "CREATE_EXPENSE",
          body: payload,
          id: payload.request_id,
        });
        return { offline: true };
      }
      return postExpense(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["daily-summary"] });
      setAmount("");
      setNote("");
      showToast(
        isOnline ? "Expense added" : "Expense queued — will sync when you’re online",
        "success"
      );
      amountRef.current?.focus();
    },
    onError: (err) => {
      const code = err?.response?.data?.code;
      const msg = err?.response?.data?.message || err.message || "Could not save expense";
      showToast(code === "FEATURE_DISABLED" ? "Expenses are disabled for this workspace." : msg, "error");
    },
  });

  const effectiveCategory =
    category === CATEGORY_OTHER ? categoryCustom.trim().toLowerCase() || "misc" : category;

  const onSubmit = (e) => {
    e.preventDefault();
    const n = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      showToast("Enter a valid amount", "error");
      return;
    }
    if (category === CATEGORY_OTHER && !categoryCustom.trim()) {
      showToast("Enter a category name", "error");
      return;
    }
    const request_id = crypto.randomUUID();
    const event_id = crypto.randomUUID();
    mutation.mutate({
      amount: n,
      category: effectiveCategory,
      note: note.trim() || undefined,
      request_id,
      event_id,
    });
  };

  const todayEmpty = !isLoading && isOnline && expenses.length === 0;

  return (
    <FeatureGate featureKey="EXPENSES" label="Expense tracking is not enabled for this workspace.">
      <section className="mx-auto max-w-lg space-y-6 px-3 py-4 md:px-0">
        <header>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Expenses</h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Record costs in one tap. Totals feed into today&apos;s gross profit on the dashboard.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Amount
              <input
                ref={amountRef}
                autoFocus
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-lg dark:border-stone-600 dark:bg-stone-950"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Category
              <select
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-950"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_SELECT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {category === CATEGORY_OTHER && (
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-950"
                value={categoryCustom}
                onChange={(e) => setCategoryCustom(e.target.value)}
                placeholder="Category name"
              />
            )}
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Note <span className="font-normal text-stone-400">(optional)</span>
              <input
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-950"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Fuel for generator"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-4 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:text-stone-950"
          >
            {mutation.isPending ? "Adding…" : "Save expense"}
          </button>
          {!isOnline && (
            <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-400">Offline — will sync when you reconnect.</p>
          )}
        </form>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Today
          </h2>
          {isLoading && <p className="mt-2 text-sm text-stone-500">Loading…</p>}
          {todayEmpty && (
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              No expenses yet — track your spending to see real profit
            </p>
          )}
          {!isOnline && (
            <p className="mt-2 text-sm text-stone-500">Connect to load expenses. New entries queue for sync.</p>
          )}
          <ul className="mt-2 space-y-2">
            {expenses.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {formatMoney(row.amount, currencySymbol)} — {formatCategoryDisplay(row.category)}
                  </span>
                  <span className="text-xs text-stone-500">{formatExpenseTime(row.createdAt)}</span>
                </div>
                {row.note ? <p className="mt-1 text-stone-600 dark:text-stone-400">{row.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </FeatureGate>
  );
}
