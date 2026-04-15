import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { loginRequest, staffLoginRequest } from "../services/api";
import { persistOfflineBundleFromStaffLogin, verifyOfflinePinAndLogin } from "../auth/offlineStaffLogin";
import { useToastStore } from "../stores/toastStore";
import ThemeToggle from "../components/ThemeToggle";
import { CORE_POSITIONING } from "../config/productMode";
import { loginErrorMessage } from "../utils/authErrors";
import { trackEvent } from "../utils/analytics";
import { auditAuthLogin } from "../audit/auditCalls";

function defaultPathForRole(role) {
  if (role === "CASHIER") return "/pos";
  return "/dashboard";
}

function isLikelyNetworkError(err) {
  return !err?.response || err?.code === "ERR_NETWORK" || err?.message === "Network Error";
}

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showToast = useToastStore((s) => s.showToast);
  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmitEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await loginRequest(email, password);
      login({
        token: data.token,
        user: data.user,
      });
      void auditAuthLogin({ method: "password" });
      trackEvent("login", { method: "password" });
      showToast("Signed in successfully.", "success");
      const next = searchParams.get("redirect");
      const fallback = defaultPathForRole(data.user?.role);
      navigate(
        next && next.startsWith("/") && !next.startsWith("//") ? next : fallback
      );
    } catch (err) {
      showToast(loginErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitPhone = async (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      showToast("Enter your PIN (4–6 digits).", "error");
      return;
    }
    setLoading(true);
    try {
      const offlineOnly = typeof navigator !== "undefined" && !navigator.onLine;
      if (offlineOnly) {
        const off = await verifyOfflinePinAndLogin(phone, pin);
        if (!off.ok) {
          showToast(
            off.reason === "no_bundle"
              ? "Connect once with internet to enable offline sign-in on this device."
              : "Invalid phone or PIN.",
            "error"
          );
          return;
        }
        trackEvent("login", { method: "phone_pin_offline" });
        void auditAuthLogin({ method: "phone_pin_offline" });
        showToast("Signed in (offline). Sales will sync when you’re back online.", "success");
        const next = searchParams.get("redirect");
        const role = useAuthStore.getState().user?.role;
        const fallback = defaultPathForRole(role);
        navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
        return;
      }

      try {
        const data = await staffLoginRequest(phone, pin);
        await persistOfflineBundleFromStaffLogin(data);
        login({
          token: data.token,
          user: data.user,
        });
        void auditAuthLogin({ method: "phone_pin" });
        trackEvent("login", { method: "phone_pin" });
        showToast("Signed in successfully.", "success");
        const next = searchParams.get("redirect");
        const fallback = defaultPathForRole(data.user?.role);
        navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          const off = await verifyOfflinePinAndLogin(phone, pin);
          if (off.ok) {
            trackEvent("login", { method: "phone_pin_offline" });
            void auditAuthLogin({ method: "phone_pin_offline" });
            showToast("Signed in (offline). Sales will sync when you’re back online.", "success");
            const next = searchParams.get("redirect");
            const role = useAuthStore.getState().user?.role;
            const fallback = defaultPathForRole(role);
            navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
            return;
          }
        }
        throw err;
      }
    } catch (err) {
      showToast(loginErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-stone-100 dark:bg-stone-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Login</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{CORE_POSITIONING}</p>
          <p className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-400">
            Works even when your internet is down.
          </p>

          <div className="mt-4 flex rounded-lg border border-stone-200 p-0.5 dark:border-stone-600">
            <button
              type="button"
              onClick={() => setMode("email")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                mode === "email"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950"
                  : "text-stone-600 dark:text-stone-400"
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setMode("phone")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                mode === "phone"
                  ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-stone-950"
                  : "text-stone-600 dark:text-stone-400"
              }`}
            >
              Phone + PIN
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {mode === "phone"
              ? "For staff invited by WhatsApp. Use the phone number with country code (e.g. 2348012345678)."
              : "For owners and managers with email accounts."}
          </p>

          {mode === "email" ? (
            <form onSubmit={onSubmitEmail} className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmitPhone} className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                placeholder="Phone (digits, e.g. 234…)"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                required
              />
              <input
                type="password"
                inputMode="numeric"
                className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                placeholder="PIN (4–6 digits)"
                value={pin}
                maxLength={6}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
            No account?{" "}
            <Link className="font-medium text-teal-700 hover:underline dark:text-teal-400" to="/register">
              Register a business
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
