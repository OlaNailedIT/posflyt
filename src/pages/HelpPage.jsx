import { Link } from "react-router-dom";
import { useState } from "react";
import { useHelpContent, useReportIssue } from "../hooks/useSystem";
import { useToastStore } from "../stores/toastStore";

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
      showToast("Issue reported. Support will review it.", "success");
    } catch (error) {
      showToast(error.response?.data?.message || "Could not submit issue.", "error");
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-bold">Help & Support</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Need help? Contact support@posflyt.com. Your data is محفوظ and backed up.
      </p>
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">Quick Start</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.quickStart || []).map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
        <div className="mt-3 flex gap-3 text-sm">
          <Link to="/terms" className="text-teal-700 hover:underline dark:text-teal-400">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-teal-700 hover:underline dark:text-teal-400">
            Privacy Policy
          </Link>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
        <h2 className="font-semibold">Reliability Commitments</h2>
        <ul className="mt-2 space-y-1 text-xs">
          <li>- 0 duplicate recorded sales</li>
          <li>- 0 negative stock incidents</li>
          <li>- Clear sync recovery path with visible status</li>
        </ul>
      </div>
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="font-semibold">What to do if...</h2>
        <ul className="mt-2 space-y-2 text-sm">
          <li>
            <span className="font-medium">Sync failed:</span> Open Settings, check queue status, then tap Sync
            Now.
          </li>
          <li>
            <span className="font-medium">Stock mismatch:</span> Review Inventory alerts, correct stock, retry
            sync.
          </li>
          <li>
            <span className="font-medium">Offline all day:</span> Keep selling in POS; transactions queue and
            replay in order when online.
          </li>
        </ul>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 className="font-semibold">Report an issue / Send feedback</h2>
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
          placeholder="Describe the issue or share feedback"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <button type="submit" className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950">
          Send feedback
        </button>
      </form>
    </section>
  );
}
