import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getStaffInvitePreview, postAcceptStaffInvite } from "../services/api";
import ThemeToggle from "../components/ThemeToggle";

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-center text-2xl font-bold tracking-[0.4em] text-stone-900 placeholder:text-stone-400 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export default function InvitePage() {
  const { token } = useParams();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  const preview = useQuery({
    queryKey: ["staff-invite", token],
    queryFn: () => getStaffInvitePreview(token),
    enabled: Boolean(token && token.length >= 16),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => postAcceptStaffInvite({ token, pin }),
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 6) return;
    if (pin !== pin2) return;
    await accept.mutateAsync();
  };

  const errMsg =
    preview.error?.response?.data?.message ||
    preview.error?.message ||
    (preview.isError ? "Could not load this invite." : null);

  if (!token || token.length < 16) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-100 p-4 dark:bg-stone-950">
        <p className="text-stone-600 dark:text-stone-400">Invalid invite link.</p>
        <Link className="mt-4 font-semibold text-teal-700 dark:text-teal-400" to="/login">
          Go to login
        </Link>
      </div>
    );
  }

  if (preview.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-950">
        <p className="text-stone-600 dark:text-stone-400">Loading invite…</p>
      </div>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-100 p-4 dark:bg-stone-950">
        <p className="max-w-md text-center text-stone-700 dark:text-stone-300">{errMsg}</p>
        <Link className="mt-4 font-semibold text-teal-700 dark:text-teal-400" to="/login">
          Go to login
        </Link>
      </div>
    );
  }

  if (accept.isSuccess) {
    return (
      <div className="relative flex min-h-screen flex-col bg-stone-100 dark:bg-stone-950">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <p className="text-lg font-bold text-stone-900 dark:text-stone-100">You&apos;re set up</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Sign in with your phone number and the PIN you created.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-flex w-full justify-center rounded-xl bg-teal-600 py-3 font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const data = preview.data;

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
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Welcome to POSflyt</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            <span className="font-semibold text-stone-800 dark:text-stone-200">{data.fullName}</span>
            <span> · {data.role}</span>
            {data.storeName ? <span> · {data.storeName}</span> : null}
          </p>
          <p className="mt-1 text-xs text-stone-500">{data.businessName}</p>
          <p className="mt-1 text-xs text-stone-500">Phone: {data.phoneHint}</p>

          <div className="mt-6 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Create PIN (4–6 digits)
            </label>
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••"
              value={pin}
              maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Confirm PIN
            </label>
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••"
              value={pin2}
              maxLength={6}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>

          {pin.length >= 4 && pin2.length >= 4 && pin !== pin2 && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">PINs do not match</p>
          )}

          {accept.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {accept.error.response?.data?.message || "Could not complete setup."}
            </p>
          )}

          <button
            type="submit"
            disabled={
              accept.isPending ||
              pin.length < 4 ||
              pin !== pin2 ||
              pin.length > 6
            }
            className="mt-6 w-full rounded-xl bg-teal-600 py-3 text-lg font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
          >
            {accept.isPending ? "Saving…" : "Done — start selling"}
          </button>
          <p className="mt-3 text-center text-xs text-stone-500">
            Already have an account?{" "}
            <Link className="font-medium text-teal-700 dark:text-teal-400" to="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
