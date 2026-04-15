import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProductByBarcode,
  getUsageFeatures,
  postInventoryCountFinalize,
  postInventoryCountSessionEvent,
} from "../services/api";
import {
  clearInventoryCountDraft,
  getInventoryCountDraft,
  saveInventoryCountDraft,
  enqueueOutbox,
  upsertProductInCache,
} from "../services/db";
import { useProducts } from "../hooks/useProducts";
import { useOfflineStore } from "../stores/offlineStore";
import { useToastStore } from "../stores/toastStore";

function isMeasured(p) {
  return (p?.unitType || "unit") !== "unit";
}

function playScanBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.06);
  } catch {
    /* ignore */
  }
}

export default function InventoryCountPage() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const { data: products = [] } = useProducts();
  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });
  const countModeOn = usageFeatures?.flags?.INVENTORY_COUNT_MODE !== false;

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [sessionStatus, setSessionStatus] = useState("idle"); // idle | active | paused
  /** @type {Record<string, { product: object, sessionQty: number, scanEvents: number }>} */
  const [lines, setLines] = useState({});
  const [barcodeInput, setBarcodeInput] = useState("");
  const [measuredModal, setMeasuredModal] = useState(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const inputRef = useRef(null);

  const productByBarcode = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      if (p.barcode && String(p.barcode).trim()) {
        m.set(String(p.barcode).trim(), p);
      }
    }
    return m;
  }, [products]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getInventoryCountDraft();
      if (cancelled || !draft?.sessionId) return;
      setSessionId(draft.sessionId);
      setSessionStatus(draft.sessionStatus || "idle");
      if (draft.lines && Array.isArray(draft.lines)) {
        const next = {};
        for (const row of draft.lines) {
          if (row?.product?.id) {
            next[row.product.id] = {
              product: row.product,
              sessionQty: Number(row.sessionQty) || 0,
              scanEvents: Number(row.scanEvents) || 0,
            };
          }
        }
        setLines(next);
      }
      setDraftLoaded(true);
    })().catch(() => setDraftLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded && sessionStatus === "idle" && Object.keys(lines).length === 0) return;
    const t = setTimeout(() => {
      void saveInventoryCountDraft({
        sessionId,
        sessionStatus,
        lines: Object.values(lines).map((l) => ({
          product: l.product,
          sessionQty: l.sessionQty,
          scanEvents: l.scanEvents,
        })),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [sessionId, sessionStatus, lines, draftLoaded]);

  const resolveProduct = useCallback(
    async (raw) => {
      const code = String(raw ?? "").trim();
      if (!code) return null;
      const local = productByBarcode.get(code);
      if (local) return local;
      if (isOnline) {
        try {
          return await getProductByBarcode(code);
        } catch {
          return null;
        }
      }
      return null;
    },
    [isOnline, productByBarcode]
  );

  const bumpLine = useCallback((product, deltaQty, scanDelta = 0) => {
    setLines((prev) => {
      const id = product.id;
      const cur = prev[id];
      const nextQty = Math.max(0, Number((cur?.sessionQty ?? 0) + deltaQty));
      const nextScans = Math.max(0, Number((cur?.scanEvents ?? 0) + scanDelta));
      return {
        ...prev,
        [id]: {
          product: cur?.product || product,
          sessionQty: nextQty,
          scanEvents: nextScans,
        },
      };
    });
  }, []);

  const onScan = useCallback(
    async (raw) => {
      const code = String(raw ?? "").trim();
      if (!code) return;
      const product = await resolveProduct(code);
      if (!product) {
        showToast("Unknown barcode — add or fix barcode on Inventory.", "error");
        return;
      }
      if (isMeasured(product)) {
        setMeasuredModal(product);
        return;
      }
      bumpLine(product, 1, 1);
      playScanBeep();
      showToast(`${product.name} +1`, "success");
    },
    [bumpLine, resolveProduct, showToast]
  );

  const finalizeMutation = useMutation({
    mutationFn: async (payload) => {
      if (isOnline) {
        await postInventoryCountFinalize(payload);
        return { offline: false };
      }
      await enqueueOutbox({ kind: "INVENTORY_COUNT_FINALIZE", body: payload });
      return { offline: true };
    },
    onSuccess: async (result, variables) => {
      for (const line of variables.lines) {
        const prev = products.find((p) => p.id === line.productId);
        if (prev) {
          await upsertProductInCache({ ...prev, stock: line.countedQty });
        }
      }
      await clearInventoryCountDraft();
      setLines({});
      setSessionStatus("idle");
      setSessionId(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      showToast(
        result?.offline ? "Count queued — will sync when online." : "Inventory updated.",
        "success"
      );
    },
    onError: (err) => {
      showToast(err.response?.data?.message || err.message || "Could not finalize.", "error");
    },
  });

  const handleStart = async () => {
    const sid = crypto.randomUUID();
    setSessionId(sid);
    setLines({});
    setSessionStatus("active");
    setBarcodeInput("");
    try {
      await postInventoryCountSessionEvent({ type: "session_started", sessionId: sid });
    } catch {
      /* offline: skip */
    }
  };

  const handlePause = async () => {
    setSessionStatus("paused");
    try {
      await postInventoryCountSessionEvent({ type: "session_paused", sessionId });
    } catch {
      /* offline */
    }
  };

  const handleResume = async () => {
    setSessionStatus("active");
    try {
      await postInventoryCountSessionEvent({ type: "session_resumed", sessionId });
    } catch {
      /* offline */
    }
  };

  const handleFinalize = () => {
    const entries = Object.values(lines);
    if (!entries.length) {
      showToast("Nothing counted yet.", "error");
      return;
    }
    if (!window.confirm(`Apply ${entries.length} product(s) as system stock? This cannot be undone.`)) return;
    const scanCountsByProductId = {};
    for (const e of entries) {
      scanCountsByProductId[e.product.id] = e.scanEvents;
    }
    finalizeMutation.mutate({
      sessionId,
      lines: entries.map((e) => ({
        productId: e.product.id,
        countedQty: e.sessionQty,
      })),
      scanCountsByProductId,
    });
  };

  const onBarcodeKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onScan(barcodeInput);
      setBarcodeInput("");
      inputRef.current?.focus();
    }
  };

  const lineList = useMemo(() => Object.values(lines), [lines]);

  if (!countModeOn) {
    return <Navigate to="/inventory" replace />;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Inventory count</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Scan barcodes to build physical counts. Finalize writes counted quantities to stock.
        </p>
        <Link to="/inventory" className="mt-2 inline-block text-sm text-teal-700 underline dark:text-teal-400">
          ← Back to inventory
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {sessionStatus === "idle" && (
          <button
            type="button"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
            onClick={() => void handleStart()}
          >
            Start count
          </button>
        )}
        {sessionStatus === "active" && (
          <>
            <button
              type="button"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
              onClick={() => void handlePause()}
            >
              Pause
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={handleFinalize}
              disabled={finalizeMutation.isPending || !lineList.length}
            >
              Finalize count
            </button>
          </>
        )}
        {sessionStatus === "paused" && (
          <>
            <button
              type="button"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => void handleResume()}
            >
              Resume
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={handleFinalize}
              disabled={finalizeMutation.isPending || !lineList.length}
            >
              Finalize count
            </button>
          </>
        )}
      </div>

      {(sessionStatus === "active" || sessionStatus === "paused") && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Barcode</label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Focus this field and scan — most scanners send Enter after the code.
          </p>
          <input
            ref={inputRef}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 p-3 text-lg font-mono text-stone-900 outline-none ring-teal-500 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={onBarcodeKeyDown}
            placeholder="Scan barcode…"
            disabled={sessionStatus === "paused"}
            autoComplete="off"
            autoFocus
          />
          {sessionStatus === "paused" && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Paused — resume to continue scanning.</p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Session summary</h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Session ID: <span className="font-mono">{sessionId}</span> · Progress saves on this device
        </p>
        {!lineList.length ? (
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">No lines yet. Start a session and scan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-700">
            {lineList.map((row) => {
              const p = row.product;
              const unit = (p.unitType || "unit") === "unit" ? "ea" : p.unitType === "kg" ? "kg" : "L";
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-stone-100">{p.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      System stock: {p.stock ?? "—"} · Scans: {row.scanEvents} · Unit: {unit}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600"
                      onClick={() => bumpLine(p, -1, isMeasured(p) ? 0 : -1)}
                      disabled={sessionStatus === "paused"}
                    >
                      −1
                    </button>
                    <span className="min-w-[4rem] text-center font-semibold tabular-nums">
                      {row.sessionQty}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600"
                      onClick={() => bumpLine(p, 1, isMeasured(p) ? 0 : 1)}
                      disabled={sessionStatus === "paused"}
                    >
                      +1
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {measuredModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">Measured product</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{measuredModal.name}</p>
            <label className="mt-3 block text-sm text-stone-700 dark:text-stone-300">Quantity to add</label>
            <MeasuredQtyForm
              product={measuredModal}
              onCancel={() => setMeasuredModal(null)}
              onConfirm={(qty) => {
                bumpLine(measuredModal, qty, 1);
                playScanBeep();
                showToast(`${measuredModal.name} +${qty}`, "success");
                setMeasuredModal(null);
                setBarcodeInput("");
                inputRef.current?.focus();
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function MeasuredQtyForm({ product, onCancel, onConfirm }) {
  const [step, setStep] = useState("1");
  const submit = (e) => {
    e.preventDefault();
    const q = Number(step);
    if (!Number.isFinite(q) || q <= 0) return;
    onConfirm(q);
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <input
        type="number"
        min="0.001"
        step="0.001"
        value={step}
        onChange={(e) => setStep(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2 dark:border-stone-600 dark:bg-stone-950"
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-stone-300 px-3 py-1.5 text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="rounded bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white">
          Add
        </button>
      </div>
    </form>
  );
}
