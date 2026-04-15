import { create } from "zustand";

/**
 * Checkout observability (in-memory only — survives tab session, not hard refresh).
 * IndexedDB holds durable queue; this store is UI visibility (processing / queued / failed).
 * - pending: request in flight (online POST not settled yet)
 * - queued: durable local commit (IndexedDB); awaiting server confirmation via sync
 * - success: server confirmed (or duplicate idempotent hit); auto-cleared after delay
 * - failed: non-recoverable or sync permanently failed — stays visible until cap trim
 * @typedef {'pending' | 'queued' | 'success' | 'failed'} CheckoutEntryStatus
 * @typedef {{ clientTransactionId: string, source: 'pos'|'quick', startedAt: number, status: CheckoutEntryStatus, finishedAt?: number }} PendingCheckoutEntry
 */

const MAX = 30;
const SUCCESS_REMOVE_MS = 2500;

function hasEntry(entries, clientTransactionId) {
  return entries.some((e) => e.clientTransactionId === clientTransactionId);
}

export const usePendingCheckoutStore = create((set, get) => ({
  /** @type {PendingCheckoutEntry[]} */
  entries: [],

  /** Call after snapshot exists; id matches payload.client_transaction_id everywhere. */
  register: (clientTransactionId, source = "pos") => {
    const entry = {
      clientTransactionId,
      source,
      startedAt: Date.now(),
      status: "pending",
    };
    set((s) => ({
      entries: [...s.entries, entry].slice(-MAX),
    }));
  },

  /**
   * Call synchronously right after IndexedDB enqueue succeeds (before refreshCount / other awaits).
   * If registration was lost, upserts a queued row so UI matches durable local state.
   */
  markQueued: (clientTransactionId, source = "pos") => {
    set((s) => {
      if (!hasEntry(s.entries, clientTransactionId)) {
        return {
          entries: [
            ...s.entries,
            { clientTransactionId, source, startedAt: Date.now(), status: "queued" },
          ].slice(-MAX),
        };
      }
      return {
        entries: s.entries.map((e) =>
          e.clientTransactionId === clientTransactionId && e.status === "pending"
            ? { ...e, status: "queued", finishedAt: undefined }
            : e
        ),
      };
    });
  },

  /** Server accepted transaction (online response or sync replay). Idempotent replays count as success. */
  markSuccess: (clientTransactionId) => {
    set((s) => {
      if (!hasEntry(s.entries, clientTransactionId)) return s;
      return {
        entries: s.entries.map((e) =>
          e.clientTransactionId === clientTransactionId
            ? { ...e, status: "success", finishedAt: Date.now() }
            : e
        ),
      };
    });
    window.setTimeout(() => {
      get().removeEntry(clientTransactionId);
    }, SUCCESS_REMOVE_MS);
  },

  /** Non-recoverable checkout error or permanent sync failure. */
  markFailed: (clientTransactionId) => {
    set((s) => {
      if (!hasEntry(s.entries, clientTransactionId)) return s;
      return {
        entries: s.entries.map((e) =>
          e.clientTransactionId === clientTransactionId
            ? { ...e, status: "failed", finishedAt: Date.now() }
            : e
        ),
      };
    });
  },

  removeEntry: (clientTransactionId) => {
    set((s) => ({
      entries: s.entries.filter((e) => e.clientTransactionId !== clientTransactionId),
    }));
  },

  pendingOnlyCount: () => get().entries.filter((e) => e.status === "pending").length,

  queuedCount: () => get().entries.filter((e) => e.status === "queued").length,

  failedCount: () => get().entries.filter((e) => e.status === "failed").length,
}));
