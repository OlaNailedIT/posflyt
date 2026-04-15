import { Link } from "react-router-dom";
import { useToastStore } from "../../stores/toastStore";

/**
 * Copyable checkout id + deep link to Dashboard lookup (support / reconciliation).
 * Shown when the server response is ambiguous — not a substitute for "Check transaction status".
 */
export default function CheckoutAmbiguitySupport({ sessionId, visible }) {
  const showToast = useToastStore((s) => s.showToast);

  if (!visible || !sessionId) return null;

  const dashboardHref = `/dashboard?clientTransactionId=${encodeURIComponent(sessionId)}`;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      showToast("Checkout ID copied.", "success");
    } catch {
      showToast("Could not copy. Select the ID and copy manually.", "error");
    }
  };

  return (
    <details className="mt-2 rounded-lg border border-stone-200 bg-stone-50/80 p-2 text-left text-xs dark:border-stone-600 dark:bg-stone-900/50">
      <summary className="cursor-pointer font-medium text-stone-700 dark:text-stone-300">
        Checkout reference (support)
      </summary>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        If a payment went through, the recorded sale uses this same ID. Share it with support or compare it to your
        sales list.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="max-w-full break-all rounded bg-stone-200/80 px-1.5 py-1 font-mono text-[11px] text-stone-900 dark:bg-stone-800 dark:text-stone-100">
          {sessionId}
        </code>
        <button
          type="button"
          onClick={() => void copyId()}
          className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          Copy ID
        </button>
      </div>
      <p className="mt-2">
        <Link
          to={dashboardHref}
          className="font-medium text-teal-700 underline hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Look up this checkout on Dashboard
        </Link>
      </p>
    </details>
  );
}
