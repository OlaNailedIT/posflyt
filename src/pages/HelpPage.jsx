import { Link } from "react-router-dom";
import { useState } from "react";
import { useHelpContent, useReportIssue } from "../hooks/useSystem";
import { useToastStore } from "../stores/toastStore";
import { getFriendlyErrorMessage } from "../utils/friendlyApiError";

const SUPPORT_EMAIL = "support@posflyt.com";
/** Optional: set `VITE_SUPPORT_WHATSAPP_URL` to a full `https://wa.me/...` link in production. */
const SUPPORT_WHATSAPP_URL = import.meta.env.VITE_SUPPORT_WHATSAPP_URL || "";

export default function HelpPage() {
  const { data } = useHelpContent();
  const report = useReportIssue();
  const showToast = useToastStore((s) => s.showToast);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await report.mutateAsync({ subject, description });
      setSubject("");
      setDescription("");
      showToast("Thanks — we received your message and will review it.", "success");
    } catch (error) {
      showToast(
        getFriendlyErrorMessage(error) || "Could not send your message. Try again in a moment.",
        "error"
      );
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          We keep this simple: clear answers, fast responses during the pilot, and no jargon.
        </p>
      </div>

      <div className="rounded-xl border-2 border-teal-300 bg-teal-50/90 p-4 dark:border-teal-700 dark:bg-teal-950/40">
        <h2 className="text-lg font-bold text-teal-950 dark:text-teal-100">Contact support</h2>
        <p className="mt-2 text-sm text-teal-950 dark:text-teal-100">
          <span className="font-semibold">Pilot support hours:</span> Monday–Friday, 8:00–18:00 (your local business
          time, unless we agree otherwise in writing).
        </p>
        <p className="mt-2 text-sm text-teal-950 dark:text-teal-100">
          <span className="font-semibold">Typical response time:</span> within one business day for non-urgent issues;
          same day when possible for checkout, sync, or access problems.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {SUPPORT_WHATSAPP_URL ? (
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: "#25D366" }}
            >
              WhatsApp support
            </a>
          ) : null}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=POSflyt%20support`}
            className="inline-flex rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white dark:bg-teal-600"
          >
            Email {SUPPORT_EMAIL}
          </a>
        </div>
        {!SUPPORT_WHATSAPP_URL ? (
          <p className="mt-3 text-xs text-teal-900/90 dark:text-teal-200/90">
            Prefer WhatsApp? Your team can add a support link to the production app configuration so a green button
            appears here.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">About POSFlyt</h2>
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
          POSFlyt exists to give serious small retailers <strong>reliable operations</strong>: dependable checkout,
          clear inventory, and honest sync status—so you can run the day without babysitting the software.
        </p>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50/90 p-4 dark:border-teal-800 dark:bg-teal-950/40">
        <h2 className="text-lg font-semibold text-teal-900 dark:text-teal-100">Start here</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-teal-950 dark:text-teal-100">
          <li>
            <span className="font-medium">Make a sale</span> — Open{" "}
            <Link to="/pos" className="font-medium text-teal-800 underline dark:text-teal-300">
              POS
            </Link>
            , add products to the cart, then tap <strong>Checkout</strong>. You get a receipt when the sale completes.
          </li>
          <li>
            <span className="font-medium">Check daily totals</span> — Open{" "}
            <Link to="/dashboard" className="font-medium text-teal-800 underline dark:text-teal-300">
              Dashboard
            </Link>{" "}
            for today&apos;s revenue, transactions, and top sellers. Use{" "}
            <strong>View detailed analytics</strong> for deeper numbers where your plan allows.
          </li>
          <li>
            <span className="font-medium">If the internet goes down</span> — Keep selling in POS. Sales are saved on
            this device and send automatically when you are back online. Check the top of the app for queue status or
            use{" "}
            <Link to="/settings" className="font-medium text-teal-800 underline dark:text-teal-300">
              Settings
            </Link>{" "}
            → Sync (managers) to retry.
          </li>
        </ol>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Quick tips</h2>
        <ul className="mt-2 space-y-1 text-sm text-stone-700 dark:text-stone-300">
          {(data?.quickStart || []).map((item) => (
            <li key={item}>— {item}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link to="/terms" className="text-teal-700 underline dark:text-teal-400">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-teal-700 underline dark:text-teal-400">
            Privacy Policy
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">What we stand behind</h2>
        <ul className="mt-2 space-y-1 text-xs text-stone-600 dark:text-stone-400">
          <li>— No duplicate recorded sales from normal sync</li>
          <li>— Stock checks before a sale completes when online</li>
          <li>— Clear sync status so you know what still needs to upload</li>
        </ul>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">If something goes wrong</h2>
        <ul className="mt-2 space-y-2 text-sm text-stone-700 dark:text-stone-300">
          <li>
            <span className="font-medium text-stone-900 dark:text-stone-100">Sync failed:</span> Confirm Wi‑Fi or mobile
            data, then in Settings tap <strong>Sync Now</strong> (or ask a manager).
          </li>
          <li>
            <span className="font-medium text-stone-900 dark:text-stone-100">Stock mismatch:</span> Check{" "}
            <Link to="/inventory" className="text-teal-700 underline dark:text-teal-400">
              Inventory
            </Link>
            , fix counts, then sync again.
          </li>
          <li>
            <span className="font-medium text-stone-900 dark:text-stone-100">Offline all day:</span> Keep using POS;
            everything queues safely and uploads in order when you reconnect.
          </li>
        </ul>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Report an issue or feedback</h2>
        <input
          className="mt-3 w-full rounded border border-stone-300 bg-stone-50 p-2 dark:border-stone-600 dark:bg-stone-950"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <textarea
          className="mt-2 w-full rounded border border-stone-300 bg-stone-50 p-2 dark:border-stone-600 dark:bg-stone-950"
          rows={5}
          placeholder="What happened? What did you expect?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <button
          type="submit"
          className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
        >
          Send message
        </button>
      </form>
    </section>
  );
}
