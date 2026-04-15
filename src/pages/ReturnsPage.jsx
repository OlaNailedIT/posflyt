import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getTransactions } from "../services/api";
import {
  createReturnFinancialEvent,
  executeFinancialEvent,
  returnEventToLegacyApiBody,
} from "../financial/executeFinancialEvent";
import { enqueueOutbox } from "../services/db";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { formatMoney } from "../utils/currency";
import { isRecoverableNetworkError } from "../utils/networkError";
import { createCorrelationId } from "../audit/auditCorrelation";
import { auditReturnCreated } from "../audit/auditCalls";

export default function ReturnsPage() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings.currencySymbol || "$";
  const [selectedId, setSelectedId] = useState("");

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
    staleTime: 15_000,
  });

  const sales = rows.filter(
    (r) => (r.transactionType || "SALE") === "SALE" && Number(r.totalAmount) >= 0
  );

  const mutation = useMutation({
    mutationFn: async ({ clientEventId, original_transaction_id, items, correlationId: _correlationId }) => {
      const event = createReturnFinancialEvent({
        clientEventId,
        original_transaction_id,
        items,
      });
      try {
        await executeFinancialEvent(event);
      } catch (err) {
        if (isRecoverableNetworkError(err)) {
          await enqueueOutbox({
            kind: "POST_RETURN",
            body: returnEventToLegacyApiBody(event),
            id: clientEventId,
          });
          return { queued: true };
        }
        throw err;
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedId("");
      void auditReturnCreated({
        returnClientEventId: variables.clientEventId,
        originalTransactionId: variables.original_transaction_id,
        queued: Boolean(result?.queued),
        correlationId: variables.correlationId,
      });
      if (result?.queued) {
        showToast("Return queued (will sync when connection is stable).", "success");
      } else {
        showToast("Return recorded. Stock restored.", "success");
      }
    },
    onError: (err) => {
      const code = err.response?.data?.code;
      const msg =
        code === "ALREADY_FULLY_RETURNED"
          ? "This sale was already fully returned."
          : code === "RETURN_QTY_EXCEEDED"
            ? "Return quantity exceeds what was sold."
            : code === "RETURN_NOT_ALLOWED"
              ? "Only fully paid sales can be returned."
              : code === "RETURN_FAILED" || err.response?.data?.code
                ? err.response?.data?.message || "Return failed."
                : err.response?.data?.message || "Could not process return.";
      showToast(msg, "error");
    },
  });

  const onSubmit = (e) => {
    e.preventDefault();
    if (!selectedId) {
      showToast("Select a sale to return.", "error");
      return;
    }
    const correlationId = createCorrelationId();
    const clientEventId = crypto.randomUUID();
    mutation.mutate({
      clientEventId,
      original_transaction_id: selectedId,
      correlationId,
    });
  };

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Returns</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Manager or admin only. Returns route through the UFEC execution layer (RETURN_EVENT) with canonical{" "}
        <span className="font-mono text-xs">client_event_id</span>, mapped to the existing idempotent return API.
        Remaining quantities can be returned in multiple sessions. Offline returns are queued and replayed safely.
      </p>

      {isLoading && <p className="mt-4 text-sm text-stone-500">Loading sales…</p>}
      {isError && (
        <p className="mt-4 text-sm text-red-600">Could not load transactions. Check your connection.</p>
      )}

      {!isLoading && !isError && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <label className="block text-sm font-medium text-stone-800 dark:text-stone-200">
            Select sale to return
            <select
              className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-950"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— Choose —</option>
              {sales.map((t) => (
                <option key={t.id} value={t.id}>
                  {new Date(t.createdAt).toLocaleString()} — {formatMoney(Number(t.totalAmount), symbol)} —{" "}
                  {(t.id || "").slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={mutation.isPending || !selectedId}
            className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {mutation.isPending ? "Processing…" : "Confirm return (remaining qty)"}
          </button>
        </form>
      )}
    </section>
  );
}
