import { USER_MODE } from "../../config/userMode";
import { useUserModeStore } from "../../stores/userModeStore";

export default function DashboardModeToggle() {
  const dashboardMode = useUserModeStore((s) => s.dashboardMode);
  const setDashboardMode = useUserModeStore((s) => s.setDashboardMode);

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-100 p-0.5 text-xs dark:border-stone-600 dark:bg-stone-800"
      role="group"
      aria-label="Dashboard view"
    >
      <button
        type="button"
        onClick={() => setDashboardMode(USER_MODE.CASHIER)}
        className={`rounded-md px-2.5 py-1 font-medium ${
          dashboardMode === USER_MODE.CASHIER
            ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
            : "text-stone-600 dark:text-stone-400"
        }`}
      >
        Cashier
      </button>
      <button
        type="button"
        onClick={() => setDashboardMode(USER_MODE.OWNER)}
        className={`rounded-md px-2.5 py-1 font-medium ${
          dashboardMode === USER_MODE.OWNER
            ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
            : "text-stone-600 dark:text-stone-400"
        }`}
      >
        Owner
      </button>
    </div>
  );
}
