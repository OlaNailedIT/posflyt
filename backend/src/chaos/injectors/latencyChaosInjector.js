/**
 * Randomized delays for stress paths (non-blocking to HTTP thread when used in scenario async).
 */
async function sleepMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  await new Promise((r) => setTimeout(r, n));
}

function randomBetween(min, max) {
  const a = Math.max(0, Number(min) || 0);
  const b = Math.max(a, Number(max) || 0);
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** @param {{ minMs?: number, maxMs?: number }} [range] */
async function jitterSleep(range = {}) {
  const minMs = range.minMs ?? 0;
  const maxMs = range.maxMs ?? 200;
  await sleepMs(randomBetween(minMs, maxMs));
}

module.exports = {
  sleepMs,
  randomBetween,
  jitterSleep,
};
