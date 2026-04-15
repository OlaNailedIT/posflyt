const { randomUUID } = require("crypto");

const MAX = 50;
/** @type {Map<string, object>} */
const runs = new Map();

function saveRun(report) {
  const id = report.runId || randomUUID();
  const enriched = { ...report, runId: id, storedAt: new Date().toISOString() };
  runs.set(id, enriched);
  while (runs.size > MAX) {
    const first = runs.keys().next().value;
    runs.delete(first);
  }
  return enriched;
}

function getRun(runId) {
  return runs.get(runId) || null;
}

module.exports = {
  saveRun,
  getRun,
};
