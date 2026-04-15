/**
 * Phase 6.5 — in-process event broker (Kafka-style API, single-node; durable log = Phase 8+).
 * Subscribers are isolated: failures log, never block publishers.
 */

const { logger } = require("../../utils/logger");

const DEFAULT_BUFFER = 8000;

class FinancialEventBus {
  /**
   * @param {{ maxBuffer?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxBuffer = Math.max(100, Number(opts.maxBuffer) || DEFAULT_BUFFER);
    /** @type {object[]} */
    this._buffer = [];
    /** @type {Map<string, Set<(e: object) => void>>} */
    this._topics = new Map();
    this._wildcard = new Set();
  }

  /**
   * @param {object} event — from buildStreamEvent
   */
  publish(event) {
    if (!event || typeof event !== "object" || !event.type) {
      logger.warn({ event }, "eventBus.publish skipped invalid event");
      return;
    }
    this._buffer.push(event);
    if (this._buffer.length > this.maxBuffer) {
      this._buffer.splice(0, this._buffer.length - this.maxBuffer);
    }
    setImmediate(() => this._fanout(event));
  }

  /**
   * @param {string} type — event type or "*" for all
   * @param {(e: object) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribe(type, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    const key = String(type || "*");
    if (key === "*") {
      this._wildcard.add(handler);
      return () => this._wildcard.delete(handler);
    }
    if (!this._topics.has(key)) {
      this._topics.set(key, new Set());
    }
    this._topics.get(key).add(handler);
    return () => {
      const set = this._topics.get(key);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this._topics.delete(key);
      }
    };
  }

  /**
   * @param {object} event
   */
  _fanout(event) {
    const type = event.type;
    const handlers = [
      ...(this._topics.get(type) ? [...this._topics.get(type)] : []),
      ...[...this._wildcard],
    ];
    for (const fn of handlers) {
      try {
        fn(event);
      } catch (err) {
        logger.error(
          { err, type: event.type, eventId: event.eventId },
          "streaming subscriber threw (isolated)"
        );
      }
    }
  }

  /**
   * Recent events for replay / debug (newest last in buffer; we return newest first optionally).
   * @param {{ businessId?: string, clientTransactionId?: string, types?: string[], sinceMs?: number, limit?: number }} [filter]
   */
  queryRecent(filter = {}) {
    const limit = Math.min(500, Math.max(1, Number(filter.limit) || 100));
    const sinceMs = filter.sinceMs != null ? Number(filter.sinceMs) : null;
    const types = Array.isArray(filter.types) && filter.types.length ? new Set(filter.types) : null;
    const b = filter.businessId != null ? String(filter.businessId) : null;
    const tx = filter.clientTransactionId != null ? String(filter.clientTransactionId) : null;

    const out = [];
    for (let i = this._buffer.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const e = this._buffer[i];
      if (!e) continue;
      if (sinceMs != null && Number(e.timestampMs) < sinceMs) continue;
      if (types && !types.has(e.type)) continue;
      if (b && e.businessId !== b) continue;
      if (tx && e.clientTransactionId !== tx) continue;
      out.push(e);
    }
    return out;
  }

  snapshotStats() {
    return {
      buffered: this._buffer.length,
      maxBuffer: this.maxBuffer,
      topicCount: this._topics.size,
      wildcardSubscribers: this._wildcard.size,
    };
  }
}

let singleton;

function getEventBus() {
  if (!singleton) {
    singleton = new FinancialEventBus();
  }
  return singleton;
}

module.exports = {
  FinancialEventBus,
  getEventBus,
};
