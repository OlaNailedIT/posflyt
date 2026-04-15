/**
 * Phase 4 Step 6 — Cold-start + periodic self-heal (deterministic recovery classification, IFETS health tick).
 * Does not execute sync or bypass idempotency; only observes and classifies.
 */
import { useEffect } from "react";
import { runColdStartResilience, runRecoveryLoop } from "../financial/ufecRecoveryOrchestrator.js";

export function useUfecOperationalResilience() {
  useEffect(() => {
    void runColdStartResilience();
    const raw =
      typeof import.meta !== "undefined" && import.meta.env?.VITE_UFEC_SELF_HEAL_INTERVAL_MS
        ? Number(import.meta.env.VITE_UFEC_SELF_HEAL_INTERVAL_MS)
        : 90_000;
    const intervalMs = Number.isFinite(raw) ? Math.min(120_000, Math.max(60_000, raw)) : 90_000;
    const id = setInterval(() => void runRecoveryLoop(), intervalMs);
    return () => clearInterval(id);
  }, []);
}
