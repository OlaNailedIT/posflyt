import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initGoogleAdsRemarketing, initMetaPixel, trackMetaPageView } from "../../utils/analytics";

/**
 * Loads optional Meta Pixel and Google Ads tags from env. GA4/GTM are initialized in `AnalyticsProvider`.
 */
export default function MarketingPixels() {
  const location = useLocation();
  const metaId = import.meta.env.VITE_META_PIXEL_ID || "";
  const adsId = import.meta.env.VITE_GOOGLE_ADS_ID || "";

  useEffect(() => {
    if (!metaId) return;
    initMetaPixel(metaId);
  }, [metaId]);

  useEffect(() => {
    if (!metaId) return;
    trackMetaPageView();
  }, [metaId, location.pathname, location.search]);

  useEffect(() => {
    if (adsId) initGoogleAdsRemarketing(adsId);
  }, [adsId]);

  return null;
}
