/**
 * Human-readable copy for sync failure codes (IndexedDB queue + API).
 */
export function explainSyncError(codeOrMessage) {
  if (codeOrMessage == null || codeOrMessage === "") {
    return "Unknown sync issue.";
  }
  const key = String(codeOrMessage).trim();
  switch (key) {
    case "CONFLICT":
      return "This record was updated elsewhere.";
    case "INSUFFICIENT_STOCK":
      return "Not enough stock to complete sale.";
    case "INVENTORY_CONFLICT":
      return "Not enough stock to complete sale.";
    case "NETWORK_ERROR":
      return "Network issue. Will retry automatically.";
    case "MAX_RETRIES_EXCEEDED":
      return "Retry limit reached. Manual action required.";
    case "STUCK_SYNC":
      return "Sync was interrupted. Retrying.";
    case "TRANSIENT_SYNC_FAILURE":
      return "Temporary server issue. Will retry automatically.";
    case "VALIDATION_FAILED":
      return "Sale data needs correction. Open POS and resubmit.";
    case "DUPLICATE_ID":
      return "This sale was already recorded.";
    default:
      if (key.length > 120) {
        return `${key.slice(0, 117)}…`;
      }
      return key;
  }
}
