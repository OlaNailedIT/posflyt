import TrackedLink from "./TrackedLink";

const ctaClass =
  "inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-semibold shadow-sm transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:ring-offset-stone-950";
const primaryClass = `${ctaClass} bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400`;
const secondaryClass = `${ctaClass} border border-stone-300 text-stone-800 hover:bg-white/60 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800/60`;

/**
 * @param {{
 *   eyebrow?: string,
 *   title: string,
 *   subtitle?: string,
 *   primaryCta?: { to: string, children: string, event?: string },
 *   secondaryCta?: { to: string, children: string, event?: string },
 *   subline?: string,
 *   className?: string,
 * }} props
 */
export default function Hero({ eyebrow, title, subtitle, primaryCta, secondaryCta, subline, className = "" }) {
  return (
    <section className={`mx-auto max-w-6xl px-4 py-16 text-center md:py-20 ${className}`}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-400">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-4xl font-black leading-tight text-stone-900 md:text-5xl lg:text-6xl dark:text-stone-100">
        {title}
      </h1>
      {subtitle ? (
        <h2 className="mx-auto mt-4 max-w-2xl text-lg font-medium text-stone-700 md:text-xl dark:text-stone-300">
          {subtitle}
        </h2>
      ) : null}
      {primaryCta || secondaryCta ? (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {primaryCta ? (
            <TrackedLink
              to={primaryCta.to}
              eventName={primaryCta.event || "hero_primary_cta"}
              eventParams={{ label: primaryCta.children }}
              className={primaryClass}
            >
              {primaryCta.children}
            </TrackedLink>
          ) : null}
          {secondaryCta ? (
            <TrackedLink
              to={secondaryCta.to}
              eventName={secondaryCta.event || "hero_secondary_cta"}
              eventParams={{ label: secondaryCta.children }}
              className={secondaryClass}
            >
              {secondaryCta.children}
            </TrackedLink>
          ) : null}
        </div>
      ) : null}
      {subline ? <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">{subline}</p> : null}
    </section>
  );
}
