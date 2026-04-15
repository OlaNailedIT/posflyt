import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/currency";
import { VALIDATION_MODE } from "../../config/productMode";

/**
 * Actionable dashboard zone: quick actions, low stock, live sales (admin).
 */
export default function OperationsPanel({
  role,
  canViewReports,
  canEditProducts,
  lowStockAlertsOn,
  stats,
  settings,
  salesFeed,
  salesFeedUnavailable,
  stockBlockFreshness,
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Quick actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {canEditProducts ? (
            <Link
              to="/inventory"
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
            >
              Add product
            </Link>
          ) : null}
          <Link
            to="/pos"
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
          >
            Make sale
          </Link>
          <Link to="/help" className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600">
            Help
          </Link>
          {canViewReports && !VALIDATION_MODE ? (
            <Link
              to="/reports"
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
            >
              Reports
            </Link>
          ) : null}
        </div>
      </section>

      {lowStockAlertsOn ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Low stock</h2>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Freshness: {stockBlockFreshness}</p>
            </div>
            <Link
              to="/inventory?filter=low_stock"
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
            >
              Open inventory
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {(stats?.lowStockProducts || []).length ? (
              stats.lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${product.isCritical ? "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300" : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"}`}
                >
                  {product.name}: {product.stock} left (threshold {product.lowStockThreshold})
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">No low stock alerts.</p>
            )}
          </div>
        </section>
      ) : null}

      {salesFeed != null ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Live sales activity</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Latest synced activity</p>
          {salesFeedUnavailable ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              Feed temporarily unavailable. Try again shortly.
            </p>
          ) : salesFeed.length ? (
            <div className="mt-3 space-y-2">
              {salesFeed.map((sale) => (
                <div
                  key={sale.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
                >
                  <span className="font-medium">{sale.sellerName}</span>
                  <span>{formatMoney(sale.totalAmount, settings.currencySymbol)}</span>
                  <span>{new Date(sale.createdAt).toLocaleTimeString()}</span>
                  <span className="rounded bg-stone-200 px-2 py-0.5 text-xs dark:bg-stone-800">
                    {sale.paymentMethod}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">No recent sales activity.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
