import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "../ThemeToggle";

export default function Navbar() {
  const { pathname } = useLocation();
  const homePath = pathname === "/za" || pathname.startsWith("/za/") ? "/za" : pathname === "/ng" || pathname.startsWith("/ng/") ? "/ng" : "/";

  return (
    <nav className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-100/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={homePath} className="text-xl font-bold text-teal-800 dark:text-teal-400">
            POSflyt
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span className="hidden sm:inline">Region:</span>
            <Link
              to="/"
              className={`rounded px-2 py-0.5 ${pathname === "/" ? "bg-stone-200 font-medium dark:bg-stone-800" : "hover:underline"}`}
            >
              Global
            </Link>
            <Link
              to="/ng"
              className={`rounded px-2 py-0.5 ${pathname === "/ng" || pathname.startsWith("/ng/") ? "bg-stone-200 font-medium dark:bg-stone-800" : "hover:underline"}`}
            >
              NG
            </Link>
            <Link
              to="/za"
              className={`rounded px-2 py-0.5 ${pathname === "/za" || pathname.startsWith("/za/") ? "bg-stone-200 font-medium dark:bg-stone-800" : "hover:underline"}`}
            >
              ZA
            </Link>
          </div>
        </div>
        <div className="hidden gap-6 text-sm text-stone-600 dark:text-stone-400 md:flex">
          <a className="hover:text-stone-900 dark:hover:text-stone-200" href="#dashboard">
            Value
          </a>
          <a className="hover:text-stone-900 dark:hover:text-stone-200" href="#dashboard">
            Dashboard
          </a>
          <a className="hover:text-stone-900 dark:hover:text-stone-200" href="#how-it-works">
            How it works
          </a>
          <a className="hover:text-stone-900 dark:hover:text-stone-200" href="#pricing">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-200/80 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Login
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
