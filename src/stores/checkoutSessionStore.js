import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emitCheckoutTelemetry, shortId } from "../utils/checkoutTelemetry";

/**
 * @typedef {'idle' | 'pending' | 'verifying' | 'manual_verification_required'} CheckoutSessionStatus
 * manual_verification_required: reconcile backoff exhausted; keep same session id until user confirms via history or GET succeeds.
 * @typedef {'pos' | 'quick'} CheckoutChannel
 */

const initial = () => ({
  /** @type {string | null} */
  sessionId: null,
  /** @type {CheckoutChannel | null} */
  channel: null,
  /** @type {CheckoutSessionStatus} */
  status: "idle",
  /** Sticky reuse key (cart + payment intent, not ids). */
  intentFingerprint: null,
  /** @type {string | null} */
  eventId: null,
  createdAt: null,
  lastAttemptAt: null,
  retryCount: 0,
});

const STICKY_STATUSES = ["pending", "verifying", "manual_verification_required"];

export const useCheckoutSessionStore = create(
  persist(
    (set, get) => ({
      ...initial(),

      /**
       * Reuses session when intent matches and outcome is still uncertain (in-flight or manual verify).
       * After server-confirmed failure we clearSession() so the next checkout mints a new id safely.
       */
      allocateSession: (channel, intentFingerprint) => {
        let s = get();
        if (/** @type {string} */ (s.status) === "failed") {
          set({ status: "manual_verification_required" });
          s = get();
        }
        const sticky =
          s.sessionId &&
          s.channel === channel &&
          s.intentFingerprint === intentFingerprint &&
          STICKY_STATUSES.includes(s.status);
        if (sticky && s.eventId) {
          set({ lastAttemptAt: Date.now(), status: "pending" });
          return { sessionId: s.sessionId, eventId: s.eventId, reused: true };
        }
        const sessionId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        set({
          sessionId,
          channel,
          intentFingerprint,
          eventId,
          status: "pending",
          createdAt: Date.now(),
          lastAttemptAt: Date.now(),
          retryCount: 0,
        });
        return { sessionId, eventId, reused: false };
      },

      setStatus: (/** @type {CheckoutSessionStatus} */ status) => set({ status }),

      markManualVerificationRequired: () => {
        const s = get();
        emitCheckoutTelemetry("CHECKOUT_MANUAL_VERIFICATION_REQUIRED", {
          clientTransactionId: s.sessionId ? shortId(s.sessionId) : null,
          channel: s.channel,
        });
        set({ status: "manual_verification_required" });
      },

      bumpRetry: () =>
        set((state) => ({
          retryCount: state.retryCount + 1,
          lastAttemptAt: Date.now(),
        })),

      clearSession: () => set(initial()),

      isCheckoutBlocked: () => {
        const st = get().status;
        return (
          st === "pending" ||
          st === "verifying" ||
          st === "manual_verification_required"
        );
      },
    }),
    {
      name: "posflyt-checkout-session-v2",
      partialize: (s) => ({
        sessionId: s.sessionId,
        channel: s.channel,
        /** Never persist `pending` — there is no in-flight HTTP after a reload; that state used to brick checkout. */
        status: s.status === "pending" ? "idle" : s.status,
        intentFingerprint: s.intentFingerprint,
        eventId: s.eventId,
        createdAt: s.createdAt,
        lastAttemptAt: s.lastAttemptAt,
        retryCount: s.retryCount,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        if (state.status === "pending") {
          useCheckoutSessionStore.setState({ status: "idle" });
        }
      },
    }
  )
);
