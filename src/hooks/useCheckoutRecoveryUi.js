import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCheckoutSessionStore } from "../stores/checkoutSessionStore";
import {
  BACKGROUND_RECONCILE_MAX_ATTEMPTS,
  MANUAL_VERIFY_ESCAPE_MS,
  backgroundReconcileDelayMs,
} from "../domain/checkoutRecoveryPolicy";
import { fetchTransactionStatusOnce } from "../domain/checkoutReconcile";
import { emitCheckoutTelemetry } from "../utils/checkoutTelemetry";

/** Returned by `runManualCheck` when the status GET fails (network / server error). */
export const MANUAL_CHECK_NETWORK_ERROR = "__checkout_manual_check_network__";

/**
 * Escape hatch, manual status check, and bounded background GET while in manual verification.
 * @param {{ channel: 'pos'|'quick', onRecover: (transaction: object) => void }} opts
 */
export function useCheckoutRecoveryUi({ channel, onRecover }) {
  /** Separate selectors — object selectors return new refs every call and break useSyncExternalStore (infinite updates). */
  const sessionId = useCheckoutSessionStore((s) => s.sessionId);
  const status = useCheckoutSessionStore((s) => s.status);
  const createdAt = useCheckoutSessionStore((s) => s.createdAt);
  const storedChannel = useCheckoutSessionStore((s) => s.channel);

  const [checkingStatus, setCheckingStatus] = useState(false);
  const bgTimeoutRef = useRef(null);

  const activeForChannel =
    storedChannel === channel &&
    sessionId &&
    (status === "verifying" || status === "manual_verification_required");

  const escapeAvailable = useMemo(() => {
    if (status !== "manual_verification_required" || !createdAt) return false;
    return Date.now() - Number(createdAt) >= MANUAL_VERIFY_ESCAPE_MS;
  }, [status, createdAt]);

  const runManualCheck = useCallback(async () => {
    if (!sessionId) return null;
    setCheckingStatus(true);
    emitCheckoutTelemetry("CHECKOUT_MANUAL_CHECK_STATUS", {
      channel,
      clientTransactionId: `${sessionId.slice(0, 8)}…`,
    });
    try {
      let tx = null;
      try {
        tx = await fetchTransactionStatusOnce(sessionId);
      } catch {
        emitCheckoutTelemetry("CHECKOUT_MANUAL_CHECK_ERROR", {
          channel,
          clientTransactionId: `${sessionId.slice(0, 8)}…`,
        });
        return MANUAL_CHECK_NETWORK_ERROR;
      }
      if (tx) {
        emitCheckoutTelemetry("CHECKOUT_MANUAL_CHECK_FOUND", {
          channel,
          clientTransactionId: `${sessionId.slice(0, 8)}…`,
        });
        onRecover(tx);
      }
      return tx;
    } finally {
      setCheckingStatus(false);
    }
  }, [sessionId, channel, onRecover]);

  useEffect(() => {
    if (!activeForChannel || status !== "manual_verification_required" || !sessionId) {
      if (bgTimeoutRef.current != null) {
        window.clearTimeout(bgTimeoutRef.current);
        bgTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      attempt += 1;
      if (attempt > BACKGROUND_RECONCILE_MAX_ATTEMPTS) {
        emitCheckoutTelemetry("CHECKOUT_BACKGROUND_RECONCILE_EXHAUSTED", {
          channel,
          attempts: BACKGROUND_RECONCILE_MAX_ATTEMPTS,
          clientTransactionId: `${sessionId.slice(0, 8)}…`,
        });
        return;
      }
      const delayMs = backgroundReconcileDelayMs(attempt);
      bgTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          if (cancelled) return;
          emitCheckoutTelemetry("CHECKOUT_BACKGROUND_RECONCILE_ATTEMPT", {
            channel,
            attempt,
            delayMs,
            clientTransactionId: `${sessionId.slice(0, 8)}…`,
          });
          try {
            const tx = await fetchTransactionStatusOnce(sessionId);
            if (cancelled) return;
            if (tx) {
              emitCheckoutTelemetry("CHECKOUT_BACKGROUND_RECONCILE_SUCCESS", { channel });
              onRecover(tx);
              return;
            }
          } catch {
            /* transient — continue chain */
          }
          scheduleNext();
        })();
      }, delayMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (bgTimeoutRef.current != null) {
        window.clearTimeout(bgTimeoutRef.current);
        bgTimeoutRef.current = null;
      }
    };
  }, [activeForChannel, status, sessionId, channel, onRecover]);

  const escapeHatch = useCallback(() => {
    emitCheckoutTelemetry("CHECKOUT_ESCAPE_HATCH", { channel });
    useCheckoutSessionStore.getState().clearSession();
  }, [channel]);

  return {
    activeForChannel,
    escapeAvailable,
    checkingStatus,
    runManualCheck,
    escapeHatch,
  };
}
