/**
 * Phase 4 Step 2 — Canonical Financial Event Ordering System (CFEOS).
 * Deterministic merge without relying on server time or network arrival order.
 */

import { getNextDeviceSequenceCounter, getUfecDeviceId } from "./ufecDeviceSequence.js";
import { FINANCIAL_EVENT_TYPE } from "./ufecSyncShadow.js";

/** Higher = processed first (reconciliation / repairs before execution traffic). */
export const UFEC_PRIORITY_WEIGHT = {
  RECONCILIATION_REPAIR: 1_000_000,
  LEDGER_CONVERGENCE: 800_000,
  FSM_REPAIR: 600_000,
  SALE_EVENT: 500_000,
  RETURN_EVENT: 500_000,
  ADJUSTMENT_EVENT: 450_000,
  OTHER_SYNC: 200_000,
};

function padNum(n, len) {
  const s = String(Math.trunc(Number(n) || 0));
  return s.length >= len ? s : "0".repeat(len - s.length) + s;
}

/**
 * Lexicographic key: ascending sort ≈ creation intent order within same priority tier.
 * @param {{
 *   priorityWeight: number,
 *   eventCreationEpoch: number,
 *   deviceSequenceId: string,
 *   deviceSequenceCounter: number,
 *   sequenceKey: string,
 * }} p
 */
export function computeGlobalOrderKey(p) {
  const epoch = padNum(p.eventCreationEpoch, 16);
  const dev = String(p.deviceSequenceId || "unknown").replace(/\|/g, "_");
  const ctr = padNum(p.deviceSequenceCounter, 12);
  const sk = String(p.sequenceKey || "").replace(/\|/g, "_").slice(0, 80);
  const pr = padNum(p.priorityWeight, 10);
  return `${pr}|${epoch}|${dev}|${ctr}|${sk}`;
}

/**
 * @param {object} opts
 * @returns {{ priorityWeight: number, eventCreationEpoch: number, deviceSequenceId: string, deviceSequenceCounter: number, sequenceKey: string, globalOrderKey: string }}
 */
export function buildCanonicalOrderFields(opts) {
  const eventCreationEpoch = Number(opts.eventCreationEpoch ?? Date.now());
  const deviceSequenceId = opts.deviceSequenceId ?? getUfecDeviceId();
  const deviceSequenceCounter =
    opts.deviceSequenceCounter != null ? Number(opts.deviceSequenceCounter) : getNextDeviceSequenceCounter();
  const sequenceKey = String(opts.sequenceKey ?? opts.clientEventId ?? crypto.randomUUID());
  const priorityWeight = Number(opts.priorityWeight ?? UFEC_PRIORITY_WEIGHT.SALE_EVENT);
  const globalOrderKey = computeGlobalOrderKey({
    priorityWeight,
    eventCreationEpoch,
    deviceSequenceId,
    deviceSequenceCounter,
    sequenceKey,
  });
  return {
    priorityWeight,
    eventCreationEpoch,
    deviceSequenceId,
    deviceSequenceCounter,
    sequenceKey,
    globalOrderKey,
  };
}

/**
 * @param {{ kind?: string, ufecEventType?: string, eventType?: string }} row
 */
function priorityWeightForQueueRow(row) {
  if (row?.ufecEventType === FINANCIAL_EVENT_TYPE.RETURN_EVENT || row?.kind === "POST_RETURN") {
    return UFEC_PRIORITY_WEIGHT.RETURN_EVENT;
  }
  if (
    row?.ufecEventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT_EVENT ||
    row?.kind === "SETTLE_PAYMENT" ||
    row?.kind === "SETTLE_CUSTOMER_CREDIT"
  ) {
    return UFEC_PRIORITY_WEIGHT.ADJUSTMENT_EVENT;
  }
  if (row?.ufecEventType === FINANCIAL_EVENT_TYPE.SALE_EVENT) {
    return UFEC_PRIORITY_WEIGHT.SALE_EVENT;
  }
  return UFEC_PRIORITY_WEIGHT.OTHER_SYNC;
}

/**
 * Derive CFEOS fields for an existing queue/outbox row (legacy rows without fields).
 * @param {{ source: 'tx'|'outbox', row: object }} entry
 */
export function getOrderMetaForMergedEntry(entry) {
  const row = entry.row;
  if (row.globalOrderKey && row.ufecPriorityWeight != null) {
    return {
      priorityWeight: Number(row.ufecPriorityWeight),
      eventCreationEpoch: Number(row.ufecEventCreationEpoch ?? row.createdAt ?? row.timestamp ?? 0),
      deviceSequenceId: String(row.ufecDeviceSequenceId ?? getUfecDeviceId()),
      deviceSequenceCounter: Number(row.ufecDeviceSequenceCounter ?? 0),
      sequenceKey: String(row.ufecSequenceKey ?? row.clientEventId ?? row.id),
      globalOrderKey: String(row.globalOrderKey),
    };
  }
  const priorityWeight = priorityWeightForQueueRow(row);
  const eventCreationEpoch = Number(row.createdAt ?? row.timestamp ?? Date.now());
  const deviceSequenceId = getUfecDeviceId();
  const deviceSequenceCounter = 0;
  const sequenceKey = String(row.clientEventId ?? row.id ?? "");
  return buildCanonicalOrderFields({
    priorityWeight,
    eventCreationEpoch,
    deviceSequenceId,
    deviceSequenceCounter,
    sequenceKey,
  });
}

/**
 * @template T
 * @param {Array<T & { __orderMeta?: ReturnType<typeof getOrderMetaForMergedEntry> }>} items — items with `source` + `row` shape OR pass `getOrderMeta(item)`
 * @param {(item: T) => object} [getMeta]
 * @returns {{ orderedEvents: T[], detectedInversions: object[], reordered: boolean, orderDrift: boolean }}
 */
export function resolveCanonicalEventOrder(items, getMeta) {
  if (!Array.isArray(items) || items.length === 0) {
    return { orderedEvents: [], detectedInversions: [], reordered: false, orderDrift: false };
  }

  const enriched = items.map((it, arrivalIndex) => {
    const meta =
      getMeta?.(it) ??
      (it.source && it.row ? getOrderMetaForMergedEntry(it) : it.__orderMeta || buildCanonicalOrderFields({}));
    return { item: it, meta, arrivalIndex };
  });

  const canonicalOrder = [...enriched].sort((a, b) => {
    if (b.meta.priorityWeight !== a.meta.priorityWeight) {
      return b.meta.priorityWeight - a.meta.priorityWeight;
    }
    if (a.meta.globalOrderKey !== b.meta.globalOrderKey) {
      return a.meta.globalOrderKey < b.meta.globalOrderKey ? -1 : 1;
    }
    return a.meta.deviceSequenceCounter - b.meta.deviceSequenceCounter;
  });

  const canonicalItems = canonicalOrder.map((e) => e.item);
  const reordered = items.some((it, i) => it !== canonicalItems[i]);

  /** @type {object[]} */
  const detectedInversions = [];
  if (reordered) {
    detectedInversions.push({
      type: "QUEUE_REORDER",
      detail: "arrival_order_differs_from_canonical",
    });
  }

  const drift = detectReturnBeforeSaleParadox(canonicalItems);
  if (drift.length) {
    detectedInversions.push(...drift);
  }

  return {
    orderedEvents: canonicalItems,
    detectedInversions,
    reordered,
    orderDrift: detectedInversions.length > 0,
  };
}

/**
 * Best-effort: same client_transaction_id used as original_transaction_id (tests / edge).
 * @param {object[]} mergedEntries — { source, row }[]
 */
function detectReturnBeforeSaleParadox(mergedEntries) {
  /** @type {object[]} */
  const out = [];
  const saleIndexByClient = new Map();
  mergedEntries.forEach((e, idx) => {
    if (e.source !== "tx") return;
    const cid = e.row?.payload?.client_transaction_id || e.row?.client_transaction_id;
    if (cid) saleIndexByClient.set(String(cid), idx);
  });
  mergedEntries.forEach((e, idx) => {
    if (e.source !== "outbox" || e.row?.kind !== "POST_RETURN") return;
    const oid = e.row?.body?.original_transaction_id;
    if (!oid) return;
    const sIdx = saleIndexByClient.get(String(oid));
    if (sIdx === undefined) return;
    if (idx < sIdx) {
      out.push({
        type: "ORDER_DRIFT_DETECTED",
        reason: "RETURN_BEFORE_SALE_SAME_ID",
        original_transaction_id: oid,
      });
    }
  });
  return out;
}

/**
 * Copy CFEOS fields from a persisted queue/outbox row onto the in-memory FinancialEvent.
 * Preserves deterministic ordering on replay (avoids re-stamping with Date.now()).
 * @param {object} event
 * @param {object} [row]
 */
export function hydrateCanonicalOrderFromQueueRow(event, row) {
  if (!row?.globalOrderKey) return event;
  event.globalOrderKey = row.globalOrderKey;
  event.priorityWeight = Number(row.ufecPriorityWeight);
  event.eventCreationEpoch = Number(row.ufecEventCreationEpoch ?? row.createdAt ?? 0);
  event.deviceSequenceId = String(row.ufecDeviceSequenceId ?? "");
  event.deviceSequenceCounter = Number(row.ufecDeviceSequenceCounter ?? 0);
  event.sequenceKey = String(row.ufecSequenceKey ?? row.clientEventId ?? row.id ?? "");
  return event;
}

/**
 * @param {ReturnType<typeof buildCanonicalOrderFields>} meta
 */
export function flattenUfecOrderFieldsToRow(meta) {
  return {
    globalOrderKey: meta.globalOrderKey,
    ufecPriorityWeight: meta.priorityWeight,
    ufecEventCreationEpoch: meta.eventCreationEpoch,
    ufecDeviceSequenceId: meta.deviceSequenceId,
    ufecDeviceSequenceCounter: meta.deviceSequenceCounter,
    ufecSequenceKey: meta.sequenceKey,
  };
}

/**
 * Attach to FinancialEvent at execution time when the row did not hydrate order fields (idempotent).
 * @param {object} event — FinancialEvent
 * @param {string} eventType — FINANCIAL_EVENT_TYPE.*
 */
export function attachCanonicalOrderToFinancialEvent(event, eventType) {
  if (event.globalOrderKey) return event;
  const clientEventId = event.clientEventId ?? event.global_event_id;
  const pw =
    eventType === FINANCIAL_EVENT_TYPE.RETURN_EVENT
      ? UFEC_PRIORITY_WEIGHT.RETURN_EVENT
      : UFEC_PRIORITY_WEIGHT.SALE_EVENT;
  const fields = buildCanonicalOrderFields({
    priorityWeight: pw,
    eventCreationEpoch: Date.now(),
    sequenceKey: String(clientEventId),
  });
  Object.assign(event, fields);
  return event;
}
