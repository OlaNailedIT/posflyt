const state = {
  api5xxCount: 0,
  startedAt: new Date().toISOString(),
  syncRetryResolution: {
    resolvedCount: 0,
    totalResolutionMs: 0,
  },
};

function incrementApi5xx() {
  state.api5xxCount += 1;
}

function recordSyncRetryResolution(resolutionMs) {
  const value = Number(resolutionMs);
  if (!Number.isFinite(value) || value < 0) return;
  state.syncRetryResolution.resolvedCount += 1;
  state.syncRetryResolution.totalResolutionMs += value;
}

function getRuntimeMetrics() {
  const resolvedCount = state.syncRetryResolution.resolvedCount;
  const averageSyncRetryResolutionTimeMs =
    resolvedCount > 0
      ? Number((state.syncRetryResolution.totalResolutionMs / resolvedCount).toFixed(2))
      : null;
  return {
    ...state,
    averageSyncRetryResolutionTimeMs,
  };
}

module.exports = { incrementApi5xx, recordSyncRetryResolution, getRuntimeMetrics };
