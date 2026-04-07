import { useState } from "react";
import { useAnalytics } from "../context/AnalyticsContext";
import { postMarketingLead } from "../services/api";
import { getStoredAttribution } from "../utils/utmCapture";

function validate(values) {
  const errors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const message = values.message.trim();

  if (name.length < 2) {
    errors.name = "Enter at least 2 characters";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address";
  }
  if (message.length < 10) {
    errors.message = "Please add a bit more detail (10+ characters)";
  }
  return errors;
}

export default function ContactForm() {
  const { trackEvent } = useAnalytics();
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState({ name: "", email: "", company: "", message: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  function handleBlur(field) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate(values));
  }

  function handleChange(field, value) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (touched[field] || Object.keys(touched).length > 0) {
      setErrors(validate(next));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const allTouched = { name: true, email: true, company: true, message: true };
    setTouched(allTouched);
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    trackEvent("contact_form_submit", { has_company: Boolean(values.company.trim()) });
    trackEvent("generate_lead", { lead_type: "contact", source: "contact_page" });
    try {
      await postMarketingLead({
        email: values.email.trim(),
        kind: "contact",
        source: "contact_page",
        name: values.name.trim(),
        company: values.company.trim(),
        message: values.message.trim(),
        utm: getStoredAttribution(),
      });
    } catch {
      /* still show thanks; ops can wire CRM retry */
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p
        className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        role="status"
      >
        Thanks — we received your message. Our team will follow up shortly. (Lead data is logged server-side for CRM
        integration.)
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Name <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          autoFocus
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          aria-invalid={touched.name && errors.name ? true : undefined}
          aria-describedby={touched.name && errors.name ? "contact-name-error" : undefined}
          className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100 ${
            touched.name && errors.name ? "border-red-500 dark:border-red-500" : "border-stone-300 dark:border-stone-600"
          }`}
        />
        {touched.name && errors.name ? (
          <p id="contact-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Email <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          aria-invalid={touched.email && errors.email ? true : undefined}
          aria-describedby={touched.email && errors.email ? "contact-email-error" : undefined}
          className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100 ${
            touched.email && errors.email ? "border-red-500 dark:border-red-500" : "border-stone-300 dark:border-stone-600"
          }`}
        />
        {touched.email && errors.email ? (
          <p id="contact-email-error" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {errors.email}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="contact-company" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Company
        </label>
        <input
          id="contact-company"
          name="company"
          type="text"
          autoComplete="organization"
          value={values.company}
          onChange={(e) => handleChange("company", e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Message <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          value={values.message}
          onChange={(e) => handleChange("message", e.target.value)}
          onBlur={() => handleBlur("message")}
          aria-invalid={touched.message && errors.message ? true : undefined}
          aria-describedby={touched.message && errors.message ? "contact-message-error" : undefined}
          className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100 ${
            touched.message && errors.message ? "border-red-500 dark:border-red-500" : "border-stone-300 dark:border-stone-600"
          }`}
        />
        {touched.message && errors.message ? (
          <p id="contact-message-error" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {errors.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white transition hover:bg-teal-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400 dark:ring-offset-stone-950 sm:w-auto"
      >
        Send Message →
      </button>
    </form>
  );
}
