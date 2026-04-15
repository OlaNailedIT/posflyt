import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUsageFeatures } from "../services/api";
import { createSaleFinancialEvent, executeFinancialEvent } from "../financial/executeFinancialEvent";
import { SYNC_STATUS } from "../constants/syncStatus";
import {
  enqueueOutbox,
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
import { formatMoney, roundCurrency } from "../utils/currency";
import { useCustomers } from "../hooks/useCustomers";
import ReceiptModal from "../components/pos/ReceiptModal";
import { calculateTaxTotal } from "../domain/tax";
import {
  buildPayloadFromPosSnapshot,
  capturePosCheckoutSnapshot,
  CHECKOUT_INTENT_PLACEHOLDER_EVENT_ID,
  CHECKOUT_INTENT_PLACEHOLDER_TX_ID,
} from "../domain/checkoutSnapshot";
import { intentFingerprintFromSnapshot } from "../domain/checkoutIntent";
import { reconcileTransactionWithBackoff } from "../domain/checkoutReconcile";
import {
  firstAcceptedTransactionResult,
  normalizeTransactionBulkResponse,
  receiptFromAcceptedResult,
} from "../domain/checkoutResponse";
import { attachPayloadHash } from "../utils/payloadHash";
import { useCheckoutSessionStore } from "../stores/checkoutSessionStore";
import {
  checkoutPrimaryActionLabel,
  checkoutSessionBlocksAction,
  checkoutShowWorkingLabel,
} from "../domain/checkoutUiState";
import {
  MANUAL_CHECK_NETWORK_ERROR,
  useCheckoutRecoveryUi,
} from "../hooks/useCheckoutRecoveryUi";
import { isRecoverableNetworkError } from "../utils/networkError";
import { usePendingCheckoutStore } from "../stores/pendingCheckoutStore";
import TransactionStatePanel from "../components/pos/TransactionStatePanel";
import CheckoutAmbiguitySupport from "../components/pos/CheckoutAmbiguitySupport";
import { explainSyncError } from "../utils/syncErrorMessages";
import { enqueueTx } from "../offline/queueStore";
import { recordSaleAppliedIntegrity, recordSaleQueuedOfflineIntegrity } from "../ledger";
import { useAuthStore } from "../stores/authStore";
import { createCorrelationId } from "../audit/auditCorrelation";
import { auditSaleCreated } from "../audit/auditCalls";

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

const SPLIT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "MOBILE", label: "Mobile" },
];

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
  const [creditSaleEnabled, setCreditSaleEnabled] = useState(false);
  const [creditOption, setCreditOption] = useState("full");
  const [partialAmountInput, setPartialAmountInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [splitPaymentEnabled, setSplitPaymentEnabled] = useState(false);
  const [splitLines, setSplitLines] = useState([
    { type: "CASH", amount: "" },
    { type: "TRANSFER", amount: "" },
  ]);

  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const creditFeatureOn = Boolean(usageFeatures?.flags?.CREDIT_SALES);
  const role = useAuthStore((s) => s.user?.role);
  const showAdvancedPaymentOptions = role === "ADMIN" || role === "MANAGER";
  const cashierFastUi = role === "CASHIER";
  const searchInputRef = useRef(null);

  const [measureModal, setMeasureModal] = useState(null);

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
  const checkoutBusy = useCartStore((s) => s.checkoutLock);
  const checkoutSessionStatus = useCheckoutSessionStore((s) => s.status);
  const checkoutSessionId = useCheckoutSessionStore((s) => s.sessionId);
  const sessionBlocksCheckout = checkoutSessionBlocksAction(checkoutSessionStatus);
  const checkoutWorkingLabel = checkoutShowWorkingLabel(checkoutSessionStatus, checkoutBusy);
  const getTotal = useCartStore((s) => s.getTotal);
  const settings = useSettingsStore((s) => s.settings);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null),
    [customers, selectedCustomerId]
  );

  const subtotal = getTotal();
  const { rate: taxRate, taxAmount } = calculateTaxTotal(subtotal, settings);
  const total = subtotal + taxAmount;

  const onRecoverFromServer = useCallback(
    (tx) => {
      void tx;
      const sid = useCheckoutSessionStore.getState().sessionId;
      useCheckoutSessionStore.getState().clearSession();
      useCartStore.getState().clearCart();
      setCreditSaleEnabled(false);
      setCreditOption("full");
      setPartialAmountInput("");
      setDueDateInput("");
      setSplitPaymentEnabled(false);
      setSplitLines([
        { type: "CASH", amount: "" },
        { type: "TRANSFER", amount: "" },
      ]);
      showToast("Sale completed.", "success");
      if (sid) usePendingCheckoutStore.getState().markSuccess(sid);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    [queryClient, showToast]
  );

  const { activeForChannel, escapeAvailable, checkingStatus, runManualCheck, escapeHatch } =
    useCheckoutRecoveryUi({ channel: "pos", onRecover: onRecoverFromServer });

  const onCheckout = () => {
    if (!items.length) return;
    const useCredit = creditFeatureOn && creditSaleEnabled;
    if (useCredit && splitPaymentEnabled) {
      showToast("Turn off split payment for credit sales.", "error");
      return;
    }
    if (splitPaymentEnabled && !useCredit) {
      const parsed = splitLines
        .map((l) => ({ type: l.type, amount: roundCurrency(Number(l.amount)) }))
        .filter((l) => l.amount > 0);
      if (parsed.length < 2) {
        showToast("Split payment needs at least two lines with amounts greater than zero.", "error");
        return;
      }
      const sum = roundCurrency(parsed.reduce((s, l) => s + l.amount, 0));
      if (Math.abs(sum - total) >= 0.005) {
        showToast("Split amounts must add up to the sale total.", "error");
        return;
      }
    }
    if (useCredit && (creditOption === "partial" || creditOption === "credit") && !selectedCustomerId) {
      showToast("Select a customer for partial or credit sales.", "error");
      return;
    }
    if (useCredit && creditOption === "partial") {
      const paid = Number(partialAmountInput);
      if (!Number.isFinite(paid) || paid <= 0 || paid >= total) {
        showToast("Enter a valid partial amount paid (greater than 0 and less than total).", "error");
        return;
      }
    }
    if (!useCartStore.getState().beginCheckout()) return;

    const tempSnap = capturePosCheckoutSnapshot({
      clientTransactionId: CHECKOUT_INTENT_PLACEHOLDER_TX_ID,
      eventId: CHECKOUT_INTENT_PLACEHOLDER_EVENT_ID,
      items,
      total,
      selectedCustomerId,
      useCredit,
      creditOption,
      partialAmountInput,
      dueDateInput,
      splitPaymentEnabled,
      splitLines,
    });
    const intentFp = intentFingerprintFromSnapshot(tempSnap);
    const { sessionId, eventId } = useCheckoutSessionStore.getState().allocateSession("pos", intentFp);

    const snapshot = capturePosCheckoutSnapshot({
      clientTransactionId: sessionId,
      eventId,
      items,
      total,
      selectedCustomerId,
      useCredit,
      creditOption,
      partialAmountInput,
      dueDateInput,
      splitPaymentEnabled,
      splitLines,
    });
    const rawPayload = buildPayloadFromPosSnapshot(snapshot);
    const txId = snapshot.clientTransactionId;
    const correlationId = snapshot.eventId;

    usePendingCheckoutStore.getState().register(txId, "pos");

    const finalizePosSuccessUI = () => {
      useCheckoutSessionStore.getState().clearSession();
      clearCart();
      setCreditSaleEnabled(false);
      setCreditOption("full");
      setPartialAmountInput("");
      setDueDateInput("");
      setSplitPaymentEnabled(false);
      setSplitLines([
        { type: "CASH", amount: "" },
        { type: "TRANSFER", amount: "" },
      ]);
    };

    void (async () => {
      const markOk = () => usePendingCheckoutStore.getState().markSuccess(txId);
      const markBad = () => usePendingCheckoutStore.getState().markFailed(txId);
      const markQ = () => usePendingCheckoutStore.getState().markQueued(txId, "pos");

      const manualVerifyToast = () => {
        showToast(
          "We couldn't confirm this transaction. Please check transaction history or recent sales before trying again.",
          "info"
        );
        markBad();
      };

      const runReconcile = async () => {
        useCheckoutSessionStore.getState().setStatus("verifying");
        const row = await reconcileTransactionWithBackoff(txId);
        if (row) {
          finalizePosSuccessUI();
          showToast("Sale completed.", "success");
          markOk();
          queryClient.invalidateQueries({ queryKey: ["products"] });
          void recordSaleAppliedIntegrity({
            transactionId: txId,
            totalAmount: total,
            source: "reconcile",
            serverTransactionId: row.id ?? null,
          }).catch(() => {});
          void auditSaleCreated({
            transactionId: row.id,
            clientTransactionId: txId,
            total,
            channel: "pos",
            duplicate: false,
            offlineQueued: false,
            correlationId,
          });
          return true;
        }
        useCheckoutSessionStore.getState().markManualVerificationRequired();
        return false;
      };

      try {
        const payload = await attachPayloadHash(
          /** @type {Record<string, unknown>} */ (rawPayload)
        );
        const saleEvent = createSaleFinancialEvent({
          clientEventId: payload.client_transaction_id,
          payload,
        });
        const raw = await executeFinancialEvent(saleEvent);
        let response;
        try {
          response = normalizeTransactionBulkResponse(raw);
        } catch {
          const ok = await runReconcile();
          if (ok) return;
          manualVerifyToast();
          return;
        }

        const first = response.results?.[0];
        if (first?.status === "failed") {
          const messageByCode = {
            INSUFFICIENT_STOCK: "Sale not saved: insufficient stock for this cart.",
            INVENTORY_CONFLICT: "Sale not saved: stock is no longer available.",
            VALIDATION_FAILED: "Sale data is invalid. Please retry checkout.",
            TRANSIENT_SYNC_FAILURE: "Temporary sync issue. Please try again in a moment.",
            FEATURE_DISABLED: "Credit feature is disabled.",
            EXCEEDS_OUTSTANDING: "Amount exceeds outstanding balance.",
            ALREADY_SETTLED: "This transaction is already fully paid.",
            INVALID_PAYMENT_AMOUNT: "Invalid payment amount.",
            INCONSISTENT_PAYMENT_STATE: "Payment totals could not be reconciled. Please retry.",
            NO_OUTSTANDING_BALANCE: "No outstanding balance to apply this payment to.",
            PAYMENT_SPLIT_MISMATCH: "Split payment amounts must add up to the sale total.",
            INVALID_ITEM_QUANTITY:
              "Enter a valid quantity (whole units for countable items, decimals for kg or litres).",
            CLIENT_TOTAL_MISMATCH: "Sale total mismatch. Refresh and try checkout again.",
            IDEMPOTENCY_PAYLOAD_MISMATCH:
              "Transaction details changed since checkout started. Please review the cart and try again.",
          };
          showToast(messageByCode[first.code] || first.message || "Checkout failed.", "error");
          useCheckoutSessionStore.getState().clearSession();
          markBad();
          return;
        }
        const accepted = firstAcceptedTransactionResult(response);
        if (accepted) {
          const receiptPayload = receiptFromAcceptedResult(accepted);
          if (receiptPayload) setReceipt(receiptPayload);
          queryClient.invalidateQueries({ queryKey: ["products"] });
          showToast(
            accepted.status === "duplicate" ? "Sale already recorded (no duplicate charge)." : "Sale completed.",
            "success"
          );
          markOk();
          finalizePosSuccessUI();
          void recordSaleAppliedIntegrity({
            transactionId: txId,
            totalAmount: total,
            source: "checkout",
            duplicate: accepted.status === "duplicate",
            serverTransactionId: accepted.transactionId ?? null,
          }).catch(() => {});
          void auditSaleCreated({
            transactionId: accepted.transactionId ?? undefined,
            clientTransactionId: txId,
            total,
            channel: "pos",
            duplicate: accepted.status === "duplicate",
            offlineQueued: false,
            correlationId,
          });
          return;
        }
        const okAmb = await runReconcile();
        if (okAmb) return;
        manualVerifyToast();
      } catch (error) {
        if (isRecoverableNetworkError(error)) {
          try {
            const payload = await attachPayloadHash(
              /** @type {Record<string, unknown>} */ (rawPayload)
            );
            await enqueueTx({ payload });
            void recordSaleQueuedOfflineIntegrity({
              transactionId: txId,
              totalAmount: total,
              payloadHash: payload.payload_hash ?? null,
            }).catch(() => {});
            markQ();
            await refreshCount();
            await loadLocalQueue();
            finalizePosSuccessUI();
            showToast("Sale saved offline (will sync automatically).", "success");
            void auditSaleCreated({
              clientTransactionId: txId,
              total,
              channel: "pos",
              offlineQueued: true,
              correlationId,
            });
          } catch {
            showToast("Could not save sale locally. Try again.", "error");
            markBad();
          }
        } else {
          const ok = await runReconcile();
          if (ok) return;
          manualVerifyToast();
        }
      } finally {
        useCartStore.getState().endCheckout();
      }
    })();
  };

  useEffect(() => {
    const s = useCheckoutSessionStore.getState();
    if (s.channel !== "pos" || !s.sessionId) return;
    if (s.status !== "verifying" && s.status !== "manual_verification_required") return;
    let cancelled = false;
    const sid = s.sessionId;
    const reconcileCorrelationId = useCheckoutSessionStore.getState().eventId ?? createCorrelationId();
    void (async () => {
      useCheckoutSessionStore.getState().setStatus("verifying");
      const row = await reconcileTransactionWithBackoff(sid);
      if (cancelled) return;
      if (row) {
        useCheckoutSessionStore.getState().clearSession();
        useCartStore.getState().clearCart();
        setCreditSaleEnabled(false);
        setCreditOption("full");
        setPartialAmountInput("");
        setDueDateInput("");
        setSplitPaymentEnabled(false);
        setSplitLines([
          { type: "CASH", amount: "" },
          { type: "TRANSFER", amount: "" },
        ]);
        showToast("Sale completed.", "success");
        usePendingCheckoutStore.getState().markSuccess(sid);
        queryClient.invalidateQueries({ queryKey: ["products"] });
        void recordSaleAppliedIntegrity({
          transactionId: sid,
          totalAmount: Number(row.totalAmount ?? row.total ?? 0),
          source: "reconcile",
          serverTransactionId: row.id ?? null,
        }).catch(() => {});
        void auditSaleCreated({
          transactionId: row.id,
          clientTransactionId: sid,
          total: Number(row.totalAmount ?? row.total ?? 0),
          channel: "pos",
          duplicate: false,
          offlineQueued: false,
          correlationId: reconcileCorrelationId,
        });
      } else {
        useCheckoutSessionStore.getState().markManualVerificationRequired();
        usePendingCheckoutStore.getState().markFailed(sid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cashierFastUi) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [cashierFastUi]);

  const queueList = (
    <ul className="mt-3 space-y-2">
      {localQueue.map((tx) => (
        <li
          key={tx.id}
          className="flex flex-col gap-1 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
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
          </div>
          {resolveSyncStatus(tx) === SYNC_STATUS.FAILED && (
            <p className="text-xs text-red-700 dark:text-red-300">
              {explainSyncError(tx.lastErrorCode || tx.syncError || tx.lastError)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );

  const productRowClass = cashierFastUi
    ? `flex min-h-[3.75rem] items-center justify-between ${lineItem} p-4 text-left text-lg font-medium transition hover:border-teal-300 hover:bg-teal-50 active:scale-[0.99] dark:hover:border-teal-700 dark:hover:bg-stone-800`
    : `flex min-h-14 items-center justify-between ${lineItem} p-3 text-left text-base transition hover:border-teal-300 hover:bg-teal-50 dark:hover:border-teal-700 dark:hover:bg-stone-800`;

  const checkoutDisabled = !items.length || checkoutBusy || sessionBlocksCheckout;
  const checkoutLabel = checkoutWorkingLabel
    ? checkoutPrimaryActionLabel(checkoutSessionStatus, "Processing…")
    : "Checkout";

  return (
    <section className={cashierFastUi ? "pb-28 lg:pb-0" : undefined}>
      {cashierFastUi ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-stone-100">POS</h1>
          <div className="flex flex-wrap items-center gap-2">
            {!isOnline && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Offline
              </span>
            )}
            {usageFeatures?.flags?.QUICK_SALES_MODE !== false && (
              <Link
                to="/pos/quick"
                className="rounded-full border-2 border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-900 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200"
              >
                Quick
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">POS</h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            How to use: add products to cart, select customer if needed, then tap Checkout.
          </p>
          <p className="mt-1 text-sm font-semibold text-teal-700 dark:text-teal-400">
            Works even when your internet is down.
          </p>
          {usageFeatures?.flags?.QUICK_SALES_MODE !== false && (
            <div className="mt-3">
              <Link
                to="/pos/quick"
                className="inline-flex items-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
              >
                Quick sale mode — one screen
              </Link>
            </div>
          )}
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
        </>
      )}

      {cashierFastUi && (pendingTransactions > 0 || failedTransactions > 0) && (
        <p className="mb-3 text-xs font-medium text-amber-800 dark:text-amber-300">
          Queue: {pendingTransactions} waiting · {failedTransactions} need retry.{" "}
          <Link to="/settings" className="font-semibold underline">
            Sync
          </Link>
        </p>
      )}

      {localQueue.length > 0 &&
        (cashierFastUi ? (
          <details className={`${card} mt-4`}>
            <summary className="cursor-pointer text-base font-semibold text-stone-900 marker:text-teal-600 dark:text-stone-100">
              Sales on this device ({localQueue.length})
            </summary>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Tap a failed sale to retry from Settings if needed.
            </p>
            {queueList}
          </details>
        ) : (
          <div className={`${card} mt-4`}>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Local sale queue</h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Status for each sale saved on this device (including synced copies kept for visibility).
            </p>
            {queueList}
          </div>
        ))}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className={
              cashierFastUi
                ? `${input} py-3 text-lg placeholder:text-stone-400`
                : input
            }
            autoComplete="off"
            enterKeyHint="search"
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
            {filtered.map((p) => {
              const isMeasured = p.unitType && p.unitType !== "unit";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (isMeasured) {
                      setMeasureModal({ product: p, quantityInput: "1" });
                    } else {
                      addToCart(p);
                    }
                  }}
                  className={productRowClass}
                >
                  <span>{p.name}</span>
                  <span className="font-semibold text-teal-800 dark:text-teal-400">
                    {formatShelfPrice(p, settings.currencySymbol)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={card}>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Cart</h2>
          <div className="mt-3">
            <TransactionStatePanel />
          </div>
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
            {creditFeatureOn &&
              showAdvancedPaymentOptions &&
              selectedCustomer &&
              Number(selectedCustomer.totalOutstanding || 0) > 0 && (
                <div className="mt-2 rounded bg-yellow-100 p-2 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100">
                  This customer owes{" "}
                  {formatMoney(Number(selectedCustomer.totalOutstanding), settings.currencySymbol)}
                </div>
              )}
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(item.unitType || "unit") !== "unit" ? (
                    <>
                      <label className="text-xs text-stone-500 dark:text-stone-400">
                        Qty ({unitLabel(item.unitType)})
                      </label>
                      <input
                        type="number"
                        min="0.001"
                        step="0.01"
                        className={`${input} w-28`}
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.id, e.target.value)}
                      />
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                  <span className="ml-auto font-medium">
                    {formatMoney(roundCurrency(item.quantity * item.unitPrice), settings.currencySymbol)}
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

          {showAdvancedPaymentOptions ? (
          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-600 dark:bg-stone-950">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
              <input
                type="checkbox"
                checked={splitPaymentEnabled}
                onChange={(e) => {
                  const v = e.target.checked;
                  setSplitPaymentEnabled(v);
                  if (v) setCreditSaleEnabled(false);
                }}
                className="rounded border-stone-400"
              />
              Split payment (cash, transfer, card, etc.)
            </label>
            {splitPaymentEnabled && (
              <div className="mt-3 space-y-2 text-sm">
                {splitLines.map((line, idx) => (
                  <div key={`split-${idx}`} className="flex flex-wrap items-center gap-2">
                    <select
                      className={`${input} min-w-[120px]`}
                      value={line.type}
                      onChange={(e) => {
                        const next = [...splitLines];
                        next[idx] = { ...next[idx], type: e.target.value };
                        setSplitLines(next);
                      }}
                    >
                      {SPLIT_METHOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${input} max-w-[160px]`}
                      placeholder="Amount"
                      value={line.amount}
                      onChange={(e) => {
                        const next = [...splitLines];
                        next[idx] = { ...next[idx], amount: e.target.value };
                        setSplitLines(next);
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs font-medium text-teal-700 underline dark:text-teal-400"
                  onClick={() => setSplitLines((prev) => [...prev, { type: "CASH", amount: "" }])}
                >
                  Add payment line
                </button>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  At least two lines with amounts &gt; 0. Must sum to{" "}
                  {formatMoney(total, settings.currencySymbol)}.
                </p>
              </div>
            )}
          </div>
          ) : null}

          {creditFeatureOn && showAdvancedPaymentOptions && (
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-600 dark:bg-stone-950">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                <input
                  type="checkbox"
                  checked={creditSaleEnabled}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setCreditSaleEnabled(v);
                    if (v) setSplitPaymentEnabled(false);
                  }}
                  className="rounded border-stone-400"
                />
                Mark as credit sale
              </label>
              {creditSaleEnabled && (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="space-y-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="creditOpt"
                        checked={creditOption === "full"}
                        onChange={() => setCreditOption("full")}
                      />
                      Full payment now
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="creditOpt"
                        checked={creditOption === "partial"}
                        onChange={() => setCreditOption("partial")}
                      />
                      Partial payment
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="creditOpt"
                        checked={creditOption === "credit"}
                        onChange={() => setCreditOption("credit")}
                      />
                      Credit (pay later)
                    </label>
                  </div>
                  {creditOption === "partial" && (
                    <div>
                      <label className="text-xs text-stone-600 dark:text-stone-400">Amount paid now</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={input}
                        value={partialAmountInput}
                        onChange={(e) => setPartialAmountInput(e.target.value)}
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                        Remaining:{" "}
                        {formatMoney(
                          Math.max(
                            0,
                            total -
                              (Number.isFinite(Number(partialAmountInput)) ? Number(partialAmountInput) : 0)
                          ),
                          settings.currencySymbol
                        )}
                      </p>
                    </div>
                  )}
                  {creditOption === "credit" && (
                    <div>
                      <label className="text-xs text-stone-600 dark:text-stone-400">Due date (optional)</label>
                      <input
                        type="datetime-local"
                        className={input}
                        value={dueDateInput}
                        onChange={(e) => setDueDateInput(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutDisabled}
            className={`mt-3 w-full rounded-lg bg-teal-600 py-3 text-lg font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400 ${cashierFastUi ? "hidden lg:block lg:py-4 lg:text-xl lg:font-black" : ""}`}
          >
            {checkoutLabel}
          </button>
          {(checkoutSessionStatus === "manual_verification_required" ||
            checkoutSessionStatus === "verifying") && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              {checkoutSessionStatus === "verifying"
                ? "Confirming sale with the server…"
                : "We couldn't confirm this sale. Check recent transactions before paying again with the same cart."}
            </p>
          )}
          {activeForChannel && (
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={checkingStatus}
                onClick={async () => {
                  const result = await runManualCheck();
                  if (result === MANUAL_CHECK_NETWORK_ERROR) {
                    showToast("Could not reach the server. Try again shortly.", "error");
                    return;
                  }
                  if (!result) {
                    showToast(
                      "No matching sale found yet. Wait a moment or confirm in your sales history.",
                      "info"
                    );
                  }
                }}
                className="rounded-lg border border-stone-300 bg-stone-100 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-200 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
              >
                {checkingStatus ? "Checking…" : "Check transaction status"}
              </button>
              {escapeAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    showToast(
                      "Starting fresh. If a payment might have gone through, confirm in your sales history before charging again.",
                      "info"
                    );
                    escapeHatch();
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Start new checkout
                </button>
              )}
            </div>
          )}
          <CheckoutAmbiguitySupport
            visible={checkoutSessionStatus === "manual_verification_required" && activeForChannel}
            sessionId={checkoutSessionId}
          />
        </div>
      </div>
      {measureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Quantity ({unitLabel(measureModal.product.unitType)})
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{measureModal.product.name}</p>
            <input
              type="number"
              min="0.001"
              step="0.01"
              className={`${input} mt-3 w-full`}
              value={measureModal.quantityInput}
              onChange={(e) => setMeasureModal((m) => (m ? { ...m, quantityInput: e.target.value } : m))}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
                onClick={() => setMeasureModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
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
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {cashierFastUi && (
        <div
          className="fixed inset-x-0 bottom-14 z-[38] border-t-2 border-stone-200 bg-white/95 px-3 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/95 lg:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Total</p>
              <p className="truncate text-xl font-black tabular-nums text-teal-800 dark:text-teal-300">
                {formatMoney(total, settings.currencySymbol)}
              </p>
            </div>
            <button
              type="button"
              onClick={onCheckout}
              disabled={checkoutDisabled}
              className="min-h-[3.25rem] min-w-[10rem] flex-1 rounded-2xl bg-teal-600 px-4 text-lg font-black text-white shadow-lg hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
            >
              {checkoutLabel}
            </button>
          </div>
        </div>
      )}

      <ReceiptModal
        key={
          receipt?.transaction?.id != null
            ? String(receipt.transaction.id)
            : receipt?.transactionId != null
              ? String(receipt.transactionId)
              : "receipt-closed"
        }
        receipt={receipt}
        onClose={() => setReceipt(null)}
      />
    </section>
  );
}
