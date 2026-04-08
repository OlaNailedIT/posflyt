/**
 * @param {{ icon?: string, title: string, description: string }} props
 */
export default function FeatureCard({ icon, title, description }) {
  return (
    <article className="group rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md dark:border-stone-700 dark:bg-stone-900/90 dark:hover:border-teal-800">
      {icon ? (
        <div
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-2xl transition group-hover:bg-teal-200/80 dark:bg-teal-950/50 dark:group-hover:bg-teal-900/60"
          aria-hidden
        >
          <span role="img">{icon}</span>
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-teal-800 dark:text-teal-400">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{description}</p>
    </article>
  );
}
