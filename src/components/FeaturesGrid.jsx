import FeatureCard from "./FeatureCard";

/**
 * @param {{
 *   id?: string,
 *   heading?: string,
 *   subheading?: string,
 *   features: Array<{ title: string, description: string, icon?: string }>,
 * }} props
 */
export default function FeaturesGrid({ id, heading, subheading, features }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 pb-16">
      {heading ? (
        <h2 className="text-center text-2xl font-bold text-stone-900 dark:text-stone-100 md:text-3xl">{heading}</h2>
      ) : null}
      {subheading ? (
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-stone-600 dark:text-stone-400">{subheading}</p>
      ) : null}
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
        ))}
      </div>
    </section>
  );
}
