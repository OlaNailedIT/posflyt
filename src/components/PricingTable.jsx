import TrackedLink from "./TrackedLink";

/**
 * @param {{ plans: Array<{ name: string, features: string, price: string, cta: string, highlight?: boolean }> }} props
 */
export default function PricingTable({ plans }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white/90 dark:border-stone-700 dark:bg-stone-900/90">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
            <th className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100" scope="col">
              Plan
            </th>
            <th className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100" scope="col">
              Features
            </th>
            <th className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100" scope="col">
              Price
            </th>
            <th className="px-4 py-3 font-semibold text-stone-900 dark:text-stone-100" scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-stone-100 transition hover:bg-stone-50/80 dark:border-stone-800 dark:hover:bg-stone-800/40 ${row.highlight ? "bg-teal-50/50 dark:bg-teal-950/20" : ""}`}
            >
              <td className="px-4 py-4 font-medium text-stone-900 dark:text-stone-100">{row.name}</td>
              <td className="px-4 py-4 text-stone-600 dark:text-stone-400">{row.features}</td>
              <td className="px-4 py-4 font-semibold text-teal-800 dark:text-teal-400">{row.price}</td>
              <td className="px-4 py-4">
                {row.cta === "Contact sales" ? (
                  <TrackedLink
                    to="/contact"
                    eventName="pricing_plan_cta"
                    eventParams={{ plan: row.name, action: "contact" }}
                    className="text-sm font-semibold text-teal-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-teal-400"
                  >
                    {row.cta}
                  </TrackedLink>
                ) : (
                  <TrackedLink
                    to="/register"
                    eventName="pricing_plan_cta"
                    eventParams={{ plan: row.name, action: "register" }}
                    className="text-sm font-semibold text-teal-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-teal-400"
                  >
                    {row.cta}
                  </TrackedLink>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
