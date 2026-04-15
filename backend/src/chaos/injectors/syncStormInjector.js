/**
 * Phase 7 — concurrent fan-out (simulates sync/reconcile storm) with bounded concurrency.
 */

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<unknown>} worker
 */
async function runBatched(items, concurrency, worker) {
  const cap = Math.max(1, Math.floor(concurrency));
  const results = new Array(items.length);
  let i = 0;
  async function one() {
    while (true) {
      const idx = i;
      i += 1;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, items.length) }, () => one()));
  return results;
}

/**
 * @param {number} count
 * @param {(i: number) => Promise<unknown>} fn
 * @param {number} concurrency
 */
async function concurrentRepeats(count, fn, concurrency) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const cap = Math.max(1, Math.floor(concurrency || 1));
  let next = 0;
  async function worker() {
    while (next < n) {
      const idx = next;
      next += 1;
      await fn(idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, n) }, () => worker()));
}

module.exports = {
  runBatched,
  concurrentRepeats,
};
