import { useCallback, useEffect, useMemo, useState } from "react";
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
import { buildReceiptMailtoHref, looksLikeEmail } from "../../utils/receiptShare";

/**
 * Receipt UI is driven only by the `receipt` prop (server-shaped snapshot).
 * Do not read cart or other mutable checkout state here.
 * Parent should pass a stable `key` (e.g. transaction id) when multiple checkouts can resolve out of order.
 */
/** @param {unknown} r */
function isRenderableReceipt(r) {
  return r != null && typeof r === "object";
}

export default function ReceiptModal({ receipt, onClose }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const { data: usageFeatures } = useQuery({
    queryKey: ["usage", "features"],
    queryFn: getUsageFeatures,
    staleTime: 60_000,
  });

  const settings = useSettingsStore((s) => s.settings);
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    if (!isRenderableReceipt(receipt)) {
      setPhoneInput("");
      setEmailInput("");
      return;
    }
    const c = receipt.transaction?.customer;
    const phone = c?.phone;
    const email = c?.email;
    if (phone) {
      setPhoneInput(digitsForWhatsApp(phone));
    } else {
      setPhoneInput("");
    }
    if (email && looksLikeEmail(String(email))) {
      setEmailInput(String(email).trim());
    } else {
      setEmailInput("");
    }
  }, [receipt]);

  /** Derived, defensive view-model; deps use receiptLayout (primitive) to limit recomputation when other settings change. */
  const snapshot = useMemo(() => {
    if (!isRenderableReceipt(receipt)) return null;
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const symbol = receipt.business?.currencySymbol || "$";
    const displayTotal = Number(receipt.total ?? 0);
    const customer = receipt.transaction?.customer;
    const customerPhone = customer?.phone;
    const customerEmailSaved = customer?.email;
    const receiptUrl = receipt.receiptUrl;
    const txId = receipt.transaction?.id;
    const paymentLines = receipt.transaction?.payments;
    const receiptGeneratorOn = usageFeatures?.flags?.RECEIPT_GENERATOR !== false;
    const whatsAppOn = usageFeatures?.flags?.WHATSAPP_RECEIPT !== false;
    const showWhatsAppFeature = receiptGeneratorOn && whatsAppOn;
    const showWhatsAppComposer = Boolean(receiptUrl && showWhatsAppFeature);
    const showWhatsAppLinkUnavailable = showWhatsAppFeature && !receiptUrl;
    const compact = settings.receiptLayout === "COMPACT";

    const paymentSummary =
      Array.isArray(paymentLines) && paymentLines.length > 0
        ? paymentLines
            .filter((p) => p && typeof p === "object")
            .map((p) => `${p.type ?? "?"}: ${formatMoney(p.amount, symbol)}`)
            .join("; ")
        : `Payment: ${receipt.transaction?.paymentMethod ?? ""}`;

    const savedPhoneDigits = customerPhone ? digitsForWhatsApp(customerPhone) : "";
    const phoneDigitsNow = digitsForWhatsApp(phoneInput);
    const usingSavedWhatsAppNumber =
      Boolean(customerPhone) &&
      savedPhoneDigits.length >= 8 &&
      savedPhoneDigits.length <= 15 &&
      phoneDigitsNow === savedPhoneDigits;

    return {
      items,
      symbol,
      displayTotal,
      customer,
      customerPhone,
      customerEmailSaved,
      receiptUrl,
      txId,
      paymentLines,
      paymentSummary,
      showWhatsAppComposer,
      showWhatsAppLinkUnavailable,
      compact,
      savedPhoneDigits,
      usingSavedWhatsAppNumber,
    };
  }, [receipt, usageFeatures, settings.receiptLayout, phoneInput]);

  const digitsForValidation = digitsForWhatsApp(phoneInput);
  const directPhoneValid = digitsForValidation.length >= 8 && digitsForValidation.length <= 15;

  const plainTextForEmail = useCallback(() => {
    if (!isRenderableReceipt(receipt) || !snapshot) return "";
    const lines = [
      `${receipt.business?.name || "Business"} — Receipt`,
      `Date: ${receipt.transaction?.dateTime ? new Date(receipt.transaction.dateTime).toLocaleString() : "—"}`,
      snapshot.paymentSummary,
      "",
      ...snapshot.items.map(
        (item) =>
          `${item.productName ?? "Item"} x${item.quantity ?? 0} @ ${formatMoney(item.unitPrice, snapshot.symbol)} = ${formatMoney(
            item.lineTotal,
            snapshot.symbol
          )}`
      ),
      "",
      `Subtotal: ${formatMoney(receipt.subtotal, snapshot.symbol)}`,
      `Tax: ${formatMoney(receipt.tax?.amount || 0, snapshot.symbol)}`,
      `Total: ${formatMoney(snapshot.displayTotal, snapshot.symbol)}`,
    ];
    return lines.join("\n");
  }, [receipt, snapshot]);

  const onDownloadTxt = useCallback(() => {
    if (!isRenderableReceipt(receipt) || !snapshot) return;
    const content = [
      `${receipt.business?.name || "Business"} Receipt`,
      `Date: ${new Date(receipt.transaction?.dateTime ?? Date.now()).toLocaleString()}`,
      snapshot.paymentSummary,
      "",
      ...snapshot.items.map(
        (item) =>
          `${item.productName ?? "Item"} x${item.quantity ?? 0} @ ${formatMoney(item.unitPrice, snapshot.symbol)} = ${formatMoney(
            item.lineTotal,
            snapshot.symbol
          )}`
      ),
      "",
      `Subtotal: ${formatMoney(receipt.subtotal, snapshot.symbol)}`,
      `Tax: ${formatMoney(receipt.tax?.amount || 0, snapshot.symbol)}`,
      `Total: ${formatMoney(snapshot.displayTotal, snapshot.symbol)}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${receipt.transaction?.id || "sale"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [receipt, snapshot]);

  const onDownloadPdf = useCallback(async () => {
    if (!snapshot?.txId) return;
    try {
      const blob = await downloadTransactionReceiptPdf(snapshot.txId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${snapshot.txId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF downloaded.", "success");
    } catch {
      showToast("Could not download PDF.", "error");
    }
  }, [snapshot, showToast]);

  const onCopyLink = useCallback(async () => {
    if (!snapshot?.receiptUrl) return;
    try {
      await navigator.clipboard.writeText(snapshot.receiptUrl);
      showToast("Receipt link copied.", "success");
    } catch {
      showToast("Could not copy link.", "error");
    }
  }, [snapshot, showToast]);

  const onOpenPdf = useCallback(() => {
    if (snapshot?.receiptUrl) window.open(snapshot.receiptUrl, "_blank", "noopener,noreferrer");
  }, [snapshot]);

  const openWhatsAppWithDigits = useCallback(
    async (digits) => {
      if (!snapshot?.txId || !snapshot?.receiptUrl) return;
      const wa = buildWhatsAppReceiptUrl(digits, snapshot.receiptUrl);
      try {
        await postWhatsAppReceiptAttempt({
          transactionId: snapshot.txId,
          receiptUrl: snapshot.receiptUrl,
          shareMode: "direct",
          customerPhoneDigits: digits,
        });
      } catch {
        /* still open WhatsApp; logging is best-effort */
      }
      window.open(wa, "_blank", "noopener,noreferrer");
      showToast("WhatsApp opened — tap Send in WhatsApp to deliver the receipt.", "success");
    },
    [snapshot, showToast]
  );

  const openWhatsAppChooseContact = useCallback(async () => {
    if (!snapshot?.txId || !snapshot?.receiptUrl) return;
    const wa = buildWhatsAppReceiptUrlChooseContact(snapshot.receiptUrl);
    try {
      await postWhatsAppReceiptAttempt({
        transactionId: snapshot.txId,
        receiptUrl: snapshot.receiptUrl,
        shareMode: "choose_contact",
      });
    } catch {
      /* still open WhatsApp; logging is best-effort */
    }
    window.open(wa, "_blank", "noopener,noreferrer");
    showToast("WhatsApp opened — choose a contact, then tap Send.", "success");
  }, [snapshot, showToast]);

  const onSendWhatsApp = useCallback(async () => {
    const digits = digitsForWhatsApp(phoneInput);
    if (digits.length < 8 || digits.length > 15) {
      showToast("Add the customer WhatsApp number with country code (digits only).", "error");
      return;
    }
    await openWhatsAppWithDigits(digits);
  }, [phoneInput, openWhatsAppWithDigits, showToast]);

  const onEmailCustomer = useCallback(() => {
    if (!isRenderableReceipt(receipt) || !snapshot) return;
    const to = emailInput.trim();
    if (!looksLikeEmail(to)) {
      showToast("Enter a valid customer email address.", "error");
      return;
    }
    const href = buildReceiptMailtoHref({
      toEmail: to,
      businessName: receipt.business?.name,
      receiptUrl: snapshot.receiptUrl || undefined,
      plainLines: snapshot.receiptUrl ? undefined : plainTextForEmail(),
    });
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Opening your email app — send the message to deliver the receipt.", "success");
  }, [receipt, snapshot, emailInput, plainTextForEmail, showToast]);

  const onPrint = useCallback(() => window.print(), []);

  if (receipt == null) {
    return null;
  }

  if (!isRenderableReceipt(receipt)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Receipt unavailable</h3>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            This receipt could not be loaded. Try closing and opening again, or use transaction history if available.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Receipt could not be prepared</h3>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Something went wrong building this receipt view. Try closing and checking your sale, or use Print / Download
            text if available.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const {
    items: receiptItems,
    symbol,
    displayTotal,
    customer,
    customerEmailSaved,
    receiptUrl,
    paymentLines,
    paymentSummary,
    showWhatsAppComposer,
    showWhatsAppLinkUnavailable,
    compact,
    usingSavedWhatsAppNumber,
  } = snapshot;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl dark:bg-stone-900">
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="Business logo" className="mb-2 h-10 w-auto object-contain" />
        ) : null}
        <h3 className="text-xl font-bold">{receipt.business?.name || "Receipt"}</h3>
        {customer?.name ? (
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Customer: {customer.name}</p>
        ) : null}
        <p className="text-sm text-stone-500">
          {receipt.transaction?.dateTime
            ? new Date(receipt.transaction.dateTime).toLocaleString()
            : "—"}
        </p>
        <div className={`mt-3 ${compact ? "space-y-1 text-xs" : "space-y-2"}`}>
          {receiptItems.map((item, idx) => (
            <div key={`${item.productName ?? "line"}-${idx}`} className="flex justify-between text-sm">
              <span>
                {item.productName ?? "Item"} x{item.quantity ?? 0}
              </span>
              <span>{formatMoney(item.lineTotal, symbol)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {Array.isArray(paymentLines) && paymentLines.length > 0 ? (
            <ul className="space-y-0.5">
              {paymentLines
                .filter((p) => p && typeof p === "object")
                .map((p, i) => (
                  <li key={`${String(p.type)}-${i}`} className="flex justify-between">
                    <span>{p.type ?? "—"}</span>
                    <span>{formatMoney(p.amount, symbol)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p>Payment: {receipt.transaction?.paymentMethod ?? "—"}</p>
          )}
        </div>
        <div className="mt-4 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatMoney(receipt.tax?.amount || 0, symbol)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{formatMoney(displayTotal, symbol)}</span>
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
            {usingSavedWhatsAppNumber ? (
              <p className="mt-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                Ready to send to this customer&apos;s saved mobile number (edit the field to use another number).
              </p>
            ) : null}
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              Use the number on file, or type digits with country code (e.g. 2348012345678). Or use &quot;Pick contact
              in WhatsApp&quot;.
            </p>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="e.g. 2348012345678"
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
              {usingSavedWhatsAppNumber ? "Send receipt via WhatsApp (saved number)" : "Send receipt via WhatsApp"}
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

        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-800 dark:bg-sky-950/30">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">Send by email</p>
          <p className="mt-1 text-xs text-sky-800/90 dark:text-sky-300/90">
            Opens your email app (Outlook, Gmail, etc.) with a pre-filled message. The customer must have an email on
            their profile or you can type one.
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="customer@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="mt-2 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 dark:border-sky-700 dark:bg-stone-950 dark:text-stone-100"
          />
          {customerEmailSaved && looksLikeEmail(String(customerEmailSaved).trim()) ? (
            <button
              type="button"
              onClick={() => {
                setEmailInput(String(customerEmailSaved).trim());
                showToast("Restored email from customer profile.", "success");
              }}
              className="mt-1 text-xs font-medium text-sky-800 underline dark:text-sky-300"
            >
              Use saved email from profile
            </button>
          ) : null}
          <button
            type="button"
            disabled={!looksLikeEmail(emailInput.trim())}
            onClick={() => onEmailCustomer()}
            className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-sky-700"
          >
            Open email to customer
          </button>
        </div>

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
