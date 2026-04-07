import TestimonialCard from "./TestimonialCard";
import TrustMetrics from "./TrustMetrics";

export default function Testimonials() {
  return (
    <section
      className="border-y border-stone-200/80 bg-white/50 py-14 dark:border-stone-800 dark:bg-stone-900/40"
      aria-labelledby="testimonials-heading"
    >
      <div className="mx-auto max-w-3xl px-4">
        <h2
          id="testimonials-heading"
          className="text-center text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"
        >
          Trusted by operators who move fast
        </h2>
        <div className="mt-8">
          <TestimonialCard
            quote="POSflyt transformed how we manage sales — efficient, reliable, and intuitive."
            name="Adeola M."
            role="Business Owner, Lagos"
            initials="AM"
          />
        </div>
        <div className="mt-10">
          <TrustMetrics />
        </div>
      </div>
    </section>
  );
}
