import { getSchemaDriftCount } from "../utils/schemaDriftLog.js";

/**
 * Client-side reliability layer: maps session schema-drift signals to a 0–100 score.
 * Merged with {@link computeUfecSystemHealthScore} via `Math.min` so local instability caps UFEC health.
 *
 * @returns {{ score: number, status: 'NORMAL' | 'DEGRADED' | 'UNSTABLE', driftCount: number }}
 */
export function computeLocalSystemHealth() {
  const drift = getSchemaDriftCount();

  let score = 100;

  if (drift > 0) score -= 5;
  if (drift > 5) score -= 15;
  if (drift > 10) score -= 30;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status = "NORMAL";
  if (score < 80) status = "DEGRADED";
  if (score < 50) status = "UNSTABLE";

  return {
    score,
    status,
    driftCount: drift,
  };
}
