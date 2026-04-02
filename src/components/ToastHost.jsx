import { useEffect } from "react";
import { useToastStore } from "../stores/toastStore";

export default function ToastHost() {
  const message = useToastStore((s) => s.message);
  const variant = useToastStore((s) => s.variant);
  const clearToast = useToastStore((s) => s.clearToast);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => clearToast(), 4200);
    return () => clearTimeout(t);
  }, [message, clearToast]);

  if (!message) return null;

  const styles =
    variant === "error"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/90 dark:text-red-100"
      : variant === "success"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100"
        : "border-stone-300 bg-white text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-lg ${styles}`}
      role="status"
    >
      {message}
    </div>
  );
}
