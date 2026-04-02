import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 py-6 dark:border-stone-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-stone-600 dark:text-stone-400">
        <p>© 2026 POSflyt Inc.</p>
        <p>Your data is محفوظ and backed up. Need help? support@posflyt.com</p>
        <div className="flex gap-4">
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/terms">
            Terms
          </Link>
          <Link className="hover:text-stone-900 dark:hover:text-stone-200" to="/help">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
