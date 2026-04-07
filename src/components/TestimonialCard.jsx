/**
 * @param {{ quote: string, name: string, role: string, initials?: string }} props
 */
export default function TestimonialCard({ quote, name, role, initials }) {
  const letters = initials || name.replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase() || "?";

  return (
    <figure className="rounded-2xl border border-stone-200 bg-white/90 p-6 text-left shadow-sm dark:border-stone-700 dark:bg-stone-900/90">
      <blockquote className="text-base font-medium italic text-stone-800 dark:text-stone-200 md:text-lg">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white dark:bg-teal-500 dark:text-stone-950"
          aria-label={`${name} avatar`}
        >
          {letters}
        </div>
        <div>
          <p className="font-semibold text-stone-900 dark:text-stone-100">{name}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">{role}</p>
        </div>
      </figcaption>
    </figure>
  );
}
