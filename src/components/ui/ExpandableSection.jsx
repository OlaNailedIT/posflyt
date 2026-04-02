import { useState } from "react";

export default function ExpandableSection({ title, children, defaultOpen = false, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</span>
        <span className="text-lg font-semibold text-teal-700 dark:text-teal-400">{open ? "-" : "+"}</span>
      </button>
      {open && <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">{children}</div>}
    </section>
  );
}
