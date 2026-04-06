import { CORE_POSITIONING, CORE_VALUE_POINTS, VALIDATION_MODE } from "../../config/productMode";
import ExpandableSection from "../ui/ExpandableSection";

/**
 * Workflow and instructional content previously shown on the dashboard.
 * Lives on the public landing page so the app dashboard stays operational.
 */
export default function ProductWorkflowSection() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 text-stone-900 dark:text-stone-100"
    >
      <h2 className="text-center text-2xl font-bold text-stone-900 dark:text-stone-100">
        How POSflyt fits your day
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm font-semibold text-stone-800 dark:text-stone-200">
        POSflyt helps you:
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {CORE_VALUE_POINTS.map((point) => (
          <span
            key={point}
            className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300"
          >
            {point}
          </span>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm font-medium text-stone-700 dark:text-stone-300">
        {CORE_POSITIONING}
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-stone-600 dark:text-stone-400">
        Track today&apos;s sales, stock risk, and customer activity in one place.
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm font-semibold text-teal-700 dark:text-teal-400">
        Works even when your internet is down.
      </p>
      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-stone-600 dark:text-stone-400">
        New to POSflyt? Add your first product to start selling. No sales yet? Start by adding a
        product, then make your first sale—your dashboard will show today&apos;s numbers as soon as
        you check out.
      </p>

      <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">How it works</h3>
        <ol className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <li>Step 1: Add your products</li>
          <li>Step 2: Use POS to make sales</li>
          <li>Step 3: Track sales and inventory</li>
          <li>Step 4: Monitor your business from the dashboard</li>
        </ol>
        <ExpandableSection title="Learn more" className="mt-4 border-stone-200 dark:border-stone-700">
          <ul className="space-y-1">
            <li>Add one product in Inventory to start quickly.</li>
            <li>Complete one sale in POS to validate your setup.</li>
            <li>Use Dashboard cards to track today&apos;s progress.</li>
          </ul>
        </ExpandableSection>
      </div>

      {VALIDATION_MODE && (
        <div className="mx-auto mt-8 max-w-3xl">
          <ExpandableSection title="Validation mode info" defaultOpen={false}>
            Advanced analytics, forecasting, and investor metrics are hidden. Focus is add product,
            make sale, and track core results.
          </ExpandableSection>
        </div>
      )}
    </section>
  );
}
