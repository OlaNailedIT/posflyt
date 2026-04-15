import BusinessStatusCard from "../../components/dashboard/BusinessStatusCard";
import ExecutiveSnapshot from "../../components/dashboard/ExecutiveSnapshot";
import OperationsPanel from "../../components/dashboard/OperationsPanel";

/**
 * Dashboard hierarchy: one executive snapshot, one business status card, one operations panel.
 * No duplicate financial or health blocks outside this layout (for the default manager view).
 */
export default function DashboardLayoutV2({ executive, businessStatus, operations }) {
  return (
    <div className="space-y-6">
      <section aria-label="Executive snapshot">
        <ExecutiveSnapshot {...executive} />
      </section>
      <section aria-label="Business status">
        <BusinessStatusCard {...businessStatus} />
      </section>
      <section aria-label="Operations">
        <OperationsPanel {...operations} />
      </section>
    </div>
  );
}
