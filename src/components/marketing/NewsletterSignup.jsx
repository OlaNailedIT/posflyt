import { useState } from "react";
import { postMarketingLead } from "../../services/api";
import { useAnalytics } from "../../context/AnalyticsContext";
import { getStoredAttribution } from "../../utils/utmCapture";

export default function NewsletterSignup({ className = "" }) {
  const { trackEvent } = useAnalytics();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("Enter a valid email.");
      return;
    }
    setStatus("loading");
    setMessage("");
    trackEvent("newsletter_signup_attempt", { source: "footer" });
    try {
      await postMarketingLead({
        email: email.trim(),
        kind: "newsletter",
        source: "footer",
        utm: getStoredAttribution(),
      });
      trackEvent("generate_lead", { lead_type: "newsletter", source: "footer" });
      setStatus("ok");
      setMessage("You are on the list. We will send product tips and offers you can opt out of anytime.");
      setEmail("");
    } catch {
      setStatus("idle");
      setMessage("Could not subscribe right now. Try again or use the contact form.");
    }
  }

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Newsletter</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
        POS tips, quota alerts, and upgrade ideas—no spam.
      </p>
      {status === "ok" ? (
        <p className="mt-3 text-sm text-teal-800 dark:text-teal-200" role="status">
          {message}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="newsletter-email" className="sr-only">
            Email
          </label>
          <input
            id="newsletter-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:text-stone-950"
          >
            {status === "loading" ? "…" : "Subscribe"}
          </button>
        </form>
      )}
      {message && status !== "ok" ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
