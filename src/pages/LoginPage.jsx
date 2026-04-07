import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { loginRequest } from "../services/api";
import { useToastStore } from "../stores/toastStore";
import ThemeToggle from "../components/ThemeToggle";
import { CORE_POSITIONING } from "../config/productMode";
import { loginErrorMessage } from "../utils/authErrors";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showToast = useToastStore((s) => s.showToast);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await loginRequest(email, password);
      login({
        token: data.token,
        user: data.user,
      });
      showToast("Signed in successfully.", "success");
      const next = searchParams.get("redirect");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
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
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Login</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{CORE_POSITIONING}</p>
          <p className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-400">
            Works even when your internet is down.
          </p>
          <input
            className="mt-4 w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="mt-3 w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 placeholder:text-stone-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            No account?{" "}
            <Link className="font-medium text-teal-700 hover:underline dark:text-teal-400" to="/register">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
