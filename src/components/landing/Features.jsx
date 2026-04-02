import ExpandableSection from "../ui/ExpandableSection";

const features = [
  {
    title: "Track every sale",
    description: "Each checkout is saved with date, amount, payment method, and cashier.",
  },
  {
    title: "Manage inventory accurately",
    description: "Stock updates after each sale, with low-stock alerts to prevent stockouts.",
  },
  {
    title: "Monitor staff activity",
    description: "See who made each sale and compare staff performance clearly.",
  },
  {
    title: "Work without internet",
    description: "Sales continue offline and sync when your connection returns.",
  },
  {
    title: "Keep customer records",
    description: "Attach customers to sales so repeat buying and support are easier.",
  },
  {
    title: "Review business results",
    description: "Use dashboard and reports to check revenue, transactions, and trends.",
  },
];

export default function Features() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100">
        How POSflyt works
      </h2>
      <ol className="mt-4 grid gap-3 rounded-xl border border-stone-200 bg-white/80 p-4 text-sm dark:border-stone-700 dark:bg-stone-900/80 md:grid-cols-2">
        <li>Step 1: Add your products</li>
        <li>Step 2: Use POS to make sales</li>
        <li>Step 3: Track sales and inventory</li>
        <li>Step 4: Monitor your business from the dashboard</li>
      </ol>
      <ExpandableSection title="Learn more" className="mt-3">
        <ul className="space-y-1">
          <li>Step 1: Add your product name, price, and stock in Inventory.</li>
          <li>Step 2: Open POS, select items, and complete checkout.</li>
          <li>Step 3: Review sales totals and low-stock alerts.</li>
          <li>Step 4: Use Dashboard to monitor daily activity and staff sales.</li>
        </ul>
      </ExpandableSection>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-stone-200 bg-white/80 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
          >
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
