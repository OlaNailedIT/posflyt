import { formatMoney } from "../../utils/currency";
import { useSettingsStore } from "../../stores/settingsStore";

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;
  const symbol = receipt.business?.currencySymbol || "$";
  const settings = useSettingsStore((s) => s.settings);
  const compact = settings.receiptLayout === "COMPACT";

  const onPrint = () => window.print();

  const onDownload = () => {
    const content = [
      `${receipt.business?.name || "Business"} Receipt`,
      `Date: ${new Date(receipt.transaction?.dateTime).toLocaleString()}`,
      `Payment: ${receipt.transaction?.paymentMethod}`,
      "",
      ...receipt.items.map(
        (item) =>
          `${item.productName} x${item.quantity} @ ${formatMoney(item.unitPrice, symbol)} = ${formatMoney(
            item.lineTotal,
            symbol
          )}`
      ),
      "",
      `Subtotal: ${formatMoney(receipt.subtotal, symbol)}`,
      `Tax: ${formatMoney(receipt.tax?.amount || 0, symbol)}`,
      `Total: ${formatMoney(receipt.total, symbol)}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${receipt.transaction?.id || "sale"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="Business logo" className="mb-2 h-10 w-auto object-contain" />
        ) : null}
        <h3 className="text-xl font-bold">{receipt.business?.name || "Receipt"}</h3>
        <p className="text-sm text-stone-500">{new Date(receipt.transaction?.dateTime).toLocaleString()}</p>
        <div className={`mt-3 ${compact ? "space-y-1 text-xs" : "space-y-2"}`}>
          {receipt.items.map((item, idx) => (
            <div key={`${item.productName}-${idx}`} className="flex justify-between text-sm">
              <span>
                {item.productName} x{item.quantity}
              </span>
              <span>{formatMoney(item.lineTotal, symbol)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatMoney(receipt.tax?.amount || 0, symbol)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{formatMoney(receipt.total, symbol)}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Print receipt
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
