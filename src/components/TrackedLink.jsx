import { Link } from "react-router-dom";
import { useAnalytics } from "../context/AnalyticsContext";

/**
 * Client-side link that emits analytics events (GA4 / dataLayer when configured).
 */
export default function TrackedLink({ to, eventName, eventParams, onClick, className, children, ...rest }) {
  const { trackEvent } = useAnalytics();

  return (
    <Link
      to={to}
      className={className}
      onClick={(e) => {
        trackEvent(eventName || "navigation_click", {
          destination: to,
          ...eventParams,
        });
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
