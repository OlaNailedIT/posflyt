import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "../../utils/currency";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToastStore } from "../../stores/toastStore";
import { downloadTransactionReceiptPdf, getUsageFeatures, postWhatsAppReceiptAttempt } from "../../services/api";
import {
  buildWhatsAppReceiptUrl,
  buildWhatsAppReceiptUrlChooseContact,
  digitsForWhatsApp,
} from "../../utils/whatsappReceipt";

export default function ReceiptModal({ receipt, onClose }) {
  const [phoneInput, setPhoneInput] = useState("");

  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });

  const customerPhone = receipt?.transaction?.customer?.phone;

  useEffect(() => {
    if (!receipt) return;
    if (customerPhone) {
      setPhoneInput(digitsForWhatsApp(customerPhone));
    } else {
      setPhoneInput("");
    }
  }, [receipt, customerPhone]);

  if (!receipt) return null;
  const symbol = receipt.business?.currencySymbol || "$";
  const settings = useSettingsStore((s) => s.settings);
  const showToast = useToastStore((s) => s.showToast);
  const compact = settings.receiptLayout === "COMPACT";
  const receiptUrl = receipt.receiptUrl;
  const txId = receipt.transaction?.id;

  const receiptGeneratorOn = usageFeatures?.flags?.RECEIPT_GENERATOR !== false;
  const whatsAppOn = usageFeatures?.flags?.WHATSAPP_RECEIPT !== false;
  const showWhatsAppFeature = receiptGeneratorOn && whatsAppOn;
  const showWhatsAppComposer = Boolean(receiptUrl && showWhatsAppFeature);
  const showWhatsAppLinkUnavailable = showWhatsAppFeature && !receiptUrl;

  const onPrint = () => window.print();

  const paymentLines = receipt.transaction?.payments;
  const paymentSummary =
    Array.isArray(paymentLines) && paymentLines.length > 0
      ? paymentLines.map((p) => `${p.type}: ${formatMoney(p.amount, symbol)}`).join("; ")
      : `Payment: ${receipt.transaction?.paymentMethod ?? ""}`;

  const onDownloadTxt = () => {
    const content = [
      `${receipt.business?.name || "Business"} Receipt`,
      `Date: ${new Date(receipt.transaction?.dateTime).toLocaleString()}`,
      paymentSummary,
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

  const onDownloadPdf = async () => {
    if (!txId) return;
    try {
      const blob = await downloadTransactionReceiptPdf(txId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${txId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF downloaded.", "success");
    } catch {
      showToast("Could not download PDF.", "error");
    }
  };

  const onCopyLink = async () => {
    if (!receiptUrl) return;
    try {
      await navigator.clipboard.writeText(receiptUrl);
      showToast("Receipt link copied.", "success");
    } catch {
      showToast("Could not copy link.", "error");
    }
  };

  const onOpenPdf = () => {
    if (receiptUrl) window.open(receiptUrl, "_blank", "noopener,noreferrer");
  };

  const openWhatsAppWithDigits = async (digits) => {
    if (!txId || !receiptUrl) return;
    const wa = buildWhatsAppReceiptUrl(digits, receiptUrl);
    try {
      await postWhatsAppReceiptAttempt({
        transactionId: txId,
        receiptUrl,
        shareMode: "direct",
        customerPhoneDigits: digits,
      });
    } catch {
      /* still open WhatsApp; logging is best-effort */
    }
    window.open(wa, "_blank", "noopener,noreferrer");
    showToast("WhatsApp opened — tap Send in WhatsApp to deliver the receipt.", "success");
  };

  const openWhatsAppChooseContact = async () => {
    if (!txId || !receiptUrl) return;
    const wa = buildWhatsAppReceiptUrlChooseContact(receiptUrl);
    try {
      await postWhatsAppReceiptAttempt({
        transactionId: txId,
        receiptUrl,
        shareMode: "choose_contact",
      });
    } catch {
      /* still open WhatsApp; logging is best-effort */
    }
    window.open(wa, "_blank", "noopener,noreferrer");
    showToast("WhatsApp opened — choose a contact, then tap Send.", "success");
  };

  const onSendWhatsApp = async () => {
    const digits = digitsForWhatsApp(phoneInput);
    if (digits.length < 8 || digits.length > 15) {
      showToast("Add the customer WhatsApp number with country code (digits only).", "error");
      return;
    }
    await openWhatsAppWithDigits(digits);
  };

  const digitsForValidation = digitsForWhatsApp(phoneInput);
  const directPhoneValid = digitsForValidation.length >= 8 && digitsForValidation.length <= 15;

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
        <div className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {Array.isArray(paymentLines) && paymentLines.length > 0 ? (
            <ul className="space-y-0.5">
              {paymentLines.map((p, i) => (
                <li key={`${p.type}-${i}`} className="flex justify-between">
                  <span>{p.type}</span>
                  <span>{formatMoney(p.amount, symbol)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Payment: {receipt.transaction?.paymentMethod}</p>
          )}
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

        {showWhatsAppLinkUnavailable ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Receipt link unavailable</p>
            <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-200/90">
              A shareable link could not be created for this sale. Use Print, Open PDF, or Download text to give the
              customer a receipt. If the problem persists, try again after the sale syncs.
            </p>
          </div>
        ) : null}

        {showWhatsAppComposer ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Send via WhatsApp</p>
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              Enter the customer&apos;s number with country code (digits only, no +). Example: 15551234567. Or use
              &quot;Pick contact in WhatsApp&quot; if you don&apos;t have a number yet.
            </p>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="e.g. 15551234567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="mt-2 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 dark:border-emerald-700 dark:bg-stone-950 dark:text-stone-100"
            />
            <button
              type="button"
              disabled={!directPhoneValid}
              onClick={() => void onSendWhatsApp()}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: "#25D366" }}
            >
              Send receipt via WhatsApp
            </button>
            <button
              type="button"
              onClick={() => void openWhatsAppChooseContact()}
              className="mt-2 w-full rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
            >
              Pick contact in WhatsApp
            </button>
            <p className="mt-2 text-xs text-emerald-800/85 dark:text-emerald-300/85">
              If WhatsApp does not open, use <span className="font-medium">Copy link</span> below and paste it in any
              chat.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Print receipt
          </button>
          {receiptUrl ? (
            <>
              <button
                type="button"
                onClick={onOpenPdf}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
              >
                Open PDF
              </button>
              <button
                type="button"
                onClick={() => void onDownloadPdf()}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => void onCopyLink()}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
              >
                Copy link
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onDownloadTxt}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Download text
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
