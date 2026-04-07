import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useOfflineStore } from "../../stores/offlineStore";
import ThemeToggle from "../ThemeToggle";
import SystemHealthBadge from "../SystemHealthBadge";
import SyncStatusIndicator from "../SyncStatusIndicator";
import { can } from "../../utils/permissions";
import { logoutAllDevices } from "../../services/api";
import { clearSessionCookie } from "../../services/authRefresh";
import { useToastStore } from "../../stores/toastStore";
import { CORE_POSITIONING, VALIDATION_MODE } from "../../config/productMode";
import ConflictResolutionHost from "../ConflictResolutionHost";
import SyncDebugPanel from "../SyncDebugPanel";

export default function AppShell() {
  const location = useLocation();
  const clearAuth = useAuthStore((s) => s.logout);

  const performLogout = async () => {
    await clearSessionCookie();
    clearAuth();
  };
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.user?.subscription_plan || "FREE");
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingTransactions = useOfflineStore((s) => s.pendingTransactions);
  const failedTransactions = useOfflineStore((s) => s.failedTransactions);
  const networkStability = useOfflineStore((s) => s.networkStability);
  const syncing = useOfflineStore((s) => s.syncing);
  const syncProgress = useOfflineStore((s) => s.syncProgress);
  const showToast = useToastStore((s) => s.showToast);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const desktopMoreRef = useRef(null);

  const primaryLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/pos", label: "POS" },
    { to: "/inventory", label: "Inventory" },
  ];
  const secondaryLinks = [
    { to: "/customers", label: "Customers" },
    { to: "/onboarding", label: "Onboarding" },
    ...(can(role, "accessSettings") ? [{ to: "/settings", label: "Settings" }] : []),
    ...(role === "ADMIN" ? [{ to: "/staff", label: "Staff" }] : []),
    ...(!VALIDATION_MODE && can(role, "viewReports") && plan !== "FREE" ? [{ to: "/reports", label: "Reports" }] : []),
    ...(!VALIDATION_MODE && role === "ADMIN" ? [{ to: "/billing", label: "Billing" }] : []),
    ...(!VALIDATION_MODE && role === "ADMIN" ? [{ to: "/audit-logs", label: "Audit Logs" }] : []),
    ...(!VALIDATION_MODE && role === "ADMIN" ? [{ to: "/backups", label: "Backups" }] : []),
    { to: "/help", label: "Help" },
  ];
  const mobilePrimaryLinks = [
    { to: "/dashboard", label: "Home", icon: "🏠" },
    { to: "/pos", label: "POS", icon: "🛒" },
    { to: "/inventory", label: "Stock", icon: "📦" },
  ];
  const businessLinks = secondaryLinks.filter((l) =>
    ["/customers", "/onboarding", "/settings", "/staff"].includes(l.to)
  );
  const systemLinks = secondaryLinks.filter((l) => ["/help"].includes(l.to));
  const adminLinks = secondaryLinks.filter((l) =>
    ["/reports", "/billing", "/audit-logs", "/backups"].includes(l.to)
  );

  useEffect(() => {
    setDesktopMoreOpen(false);
    setMobileMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!desktopMoreRef.current) return;
      if (!desktopMoreRef.current.contains(event.target)) {
        setDesktopMoreOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setDesktopMoreOpen(false);
        setMobileMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-stone-50 pb-20 text-stone-900 dark:bg-stone-950 dark:text-stone-100 md:pb-0">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-lg font-bold text-teal-800 dark:text-teal-400">
            POSflyt
          </Link>
          <nav className="hidden flex-wrap gap-2 md:flex">
            {primaryLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "bg-stone-200/90 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="relative" ref={desktopMoreRef}>
              <button
                type="button"
                onClick={() => setDesktopMoreOpen((v) => !v)}
                aria-expanded={desktopMoreOpen}
                aria-controls="desktop-more-menu"
                className="rounded-lg bg-stone-200/90 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                More
              </button>
              {desktopMoreOpen && (
                <div
                  id="desktop-more-menu"
                  className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-900"
                >
                  {!!businessLinks.length && (
                    <>
                      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                        Business
                      </p>
                      {businessLinks.map((link) => (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          onClick={() => setDesktopMoreOpen(false)}
                          className={({ isActive }) =>
                            `block rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                          }
                        >
                          {link.label}
                        </NavLink>
                      ))}
                    </>
                  )}
                  {!!systemLinks.length && (
                    <>
                      <p className="mt-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                        System
                      </p>
                      {systemLinks.map((link) => (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          onClick={() => setDesktopMoreOpen(false)}
                          className={({ isActive }) =>
                            `block rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                          }
                        >
                          {link.label}
                        </NavLink>
                      ))}
                    </>
                  )}
                  {!!adminLinks.length && (
                    <>
                      <p className="mt-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                        Admin
                      </p>
                      {adminLinks.map((link) => (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          onClick={() => setDesktopMoreOpen(false)}
                          className={({ isActive }) =>
                            `block rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                          }
                        >
                          {link.label}
                        </NavLink>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <SystemHealthBadge />
            <SyncStatusIndicator />
            <div className="rounded-lg border border-stone-300 bg-stone-100 px-2 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
              Plan: {plan} · {isOnline ? "Online" : "Offline"}
              {syncing ? " · Syncing" : ""}
              {pendingTransactions ? ` · Queue: ${pendingTransactions}` : ""}
              {failedTransactions ? ` · Failed: ${failedTransactions}` : ""}
              {failedTransactions > 0 ? " · Action needed" : ""}
              {networkStability === "transitioning" ? " · Connection stabilizing" : ""}
              {syncing && syncProgress.total
                ? ` · Progress: ${syncProgress.done}/${syncProgress.total}`
                : ""}
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void performLogout()}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await logoutAllDevices();
                  clearAuth();
                  showToast("Logged out from all devices.", "success");
                } catch {
                  showToast("Could not logout all devices.", "error");
                }
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Logout all
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-300">
          {CORE_POSITIONING}
        </div>
        <Outlet />
        <ConflictResolutionHost />
        {import.meta.env.DEV && <SyncDebugPanel />}
      </main>
      {mobileMoreOpen && (
        <div
          id="mobile-more-menu"
          className="fixed bottom-14 left-2 right-2 z-50 rounded-xl border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900 md:hidden"
        >
          {!!businessLinks.length && (
            <>
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Business
              </p>
              <div className="grid grid-cols-2 gap-1">
                {businessLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileMoreOpen(false)}
                    className={({ isActive }) =>
                      `rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
          {!!systemLinks.length && (
            <>
              <p className="mb-1 mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                System
              </p>
              <div className="grid grid-cols-2 gap-1">
                {systemLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileMoreOpen(false)}
                    className={({ isActive }) =>
                      `rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
          {!!adminLinks.length && (
            <>
              <p className="mb-1 mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Admin
              </p>
              <div className="grid grid-cols-2 gap-1">
                {adminLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileMoreOpen(false)}
                    className={({ isActive }) =>
                      `rounded px-2 py-1.5 text-sm ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"}`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white/95 px-1 py-1 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 md:hidden">
        {mobilePrimaryLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center rounded-lg py-1 text-[11px] ${isActive ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950" : "text-stone-700 dark:text-stone-300"}`
            }
          >
            <span className="text-base leading-none">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-more-menu"
          className={`flex flex-col items-center justify-center rounded-lg py-1 text-[11px] ${
            mobileMoreOpen
              ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950"
              : "text-stone-700 dark:text-stone-300"
          }`}
        >
          <span className="text-base leading-none">⋯</span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
