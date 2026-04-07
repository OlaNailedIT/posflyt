import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { captureAttributionFromUrl } from "../utils/utmCapture";
import { initGa4, initGtm, trackPageView, trackEvent as gaTrack } from "../utils/analytics";

const noop = () => {};

const AnalyticsContext = createContext({
  trackEvent: noop,
  measurementId: null,
});

export function AnalyticsProvider({ children }) {
  const location = useLocation();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
  const gtmId = import.meta.env.VITE_GTM_ID || "";

  useEffect(() => {
    captureAttributionFromUrl();
  }, []);

  useEffect(() => {
    if (gtmId) initGtm(gtmId);
    else if (measurementId) initGa4(measurementId);
  }, [gtmId, measurementId]);

  useEffect(() => {
    if (!measurementId && !gtmId) return;
    trackPageView(location.pathname + location.search);
  }, [measurementId, gtmId, location.pathname, location.search]);

  const trackEvent = useCallback((name, params) => {
    gaTrack(name, params);
  }, []);

  const value = useMemo(
    () => ({
      trackEvent,
      measurementId: measurementId || null,
      gtmId: gtmId || null,
    }),
    [trackEvent, measurementId, gtmId]
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}
