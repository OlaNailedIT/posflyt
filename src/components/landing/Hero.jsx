import { Link } from "react-router-dom";
import { CORE_POSITIONING, CORE_VALUE_POINTS, RELIABILITY_OUTCOMES } from "../../config/productMode";

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-400">
        Reliability-first POS for small businesses
      </p>
      <h1 className="text-4xl font-black leading-tight text-stone-900 md:text-6xl dark:text-stone-100">
        {CORE_POSITIONING}
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-stone-600 dark:text-stone-400">
        POSflyt helps you record every sale, keep stock correct, and recover safely from network outages.
      </p>
      <ul className="mx-auto mt-3 max-w-2xl space-y-1 text-left text-sm text-stone-700 dark:text-stone-300">
        {RELIABILITY_OUTCOMES.map((outcome) => (
          <li key={outcome}>- {outcome}</li>
        ))}
      </ul>
      <ul className="mx-auto mt-4 max-w-xl space-y-1 text-left text-sm text-stone-700 dark:text-stone-300">
        {CORE_VALUE_POINTS.map((point) => (
          <li key={point}>- {point}</li>
        ))}
      </ul>
      <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-teal-700 dark:text-teal-400">
        Works even when your internet is down.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/register"
          className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
        >
          Start with your first product
        </Link>
        <a
          href="#how-it-works"
          className="rounded-lg border border-stone-300 px-5 py-2.5 font-semibold text-stone-800 hover:bg-white/60 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800/60"
        >
          See how it works
        </a>
      </div>
    </section>
  );
}
