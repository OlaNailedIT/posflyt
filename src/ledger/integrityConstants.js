/** @enum {string} Client-side integrity shadow (IndexedDB); server DB remains canonical for synced commerce. */
export const INTEGRITY_EVENT = {
  SALE_QUEUED_OFFLINE: "SALE_QUEUED_OFFLINE",
  SALE_APPLIED: "SALE_APPLIED",
};

export const INTEGRITY_LEDGER_TYPE = {
  SALE: "SALE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
};
