import { Link } from "react-router-dom";
import NewsletterSignup from "./marketing/NewsletterSignup";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 py-10 dark:border-stone-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4">
        <div className="grid gap-8 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Grow with POSflyt</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Your data is protected and backed up. Questions?{" "}
                <Link to="/contact" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                  Contact us
                </Link>
                .
              </p>
            </div>
            <Link
              to="/register"
              className="inline-flex rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
            >
              Get Started Today →
            </Link>
          </div>
          <NewsletterSignup className="max-w-sm" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600 dark:text-stone-400">
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/about">
            About
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/features">
            Features
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/features/dashboard">
            Dashboard demo
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/blog">
            Blog
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/refer">
            Referrals
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/contact">
            Contact
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/terms">
            Terms
          </Link>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-500">© {new Date().getFullYear()} POSflyt Inc.</p>
      </div>
    </footer>
  );
}
