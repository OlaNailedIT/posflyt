import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { inferRegionFromNavigator } from "../config/pricing";

const STORAGE_KEY = "posflyt-marketing-region";

const RegionContext = createContext(null);

/**
 * Marketing / pricing region: "ng" | "za" | null (global).
 * Derived from URL (/ng, /za), then localStorage, then browser locale hint.
 */
export function RegionProvider({ children }) {
  const location = useLocation();

  const regionFromPath = useMemo(() => {
    const p = location.pathname;
    if (p === "/ng" || p.startsWith("/ng/")) return "ng";
    if (p === "/za" || p.startsWith("/za/")) return "za";
    return null;
  }, [location.pathname]);

  useEffect(() => {
    if (regionFromPath === "ng" || regionFromPath === "za") {
      try {
        localStorage.setItem(STORAGE_KEY, regionFromPath);
      } catch {
        // ignore
      }
    }
  }, [regionFromPath]);

  const storedRegion = useMemo(() => {
    if (typeof localStorage === "undefined") return null;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "ng" || v === "za") return v;
    } catch {
      // ignore
    }
    return null;
  }, [location.pathname]);

  const region = regionFromPath ?? storedRegion ?? inferRegionFromNavigator();

  const defaultCurrency = region === "za" ? "ZAR" : "NGN";

  const value = useMemo(
    () => ({
      region,
      regionFromPath,
      defaultCurrency,
    }),
    [region, regionFromPath, defaultCurrency]
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) {
    return {
      region: null,
      regionFromPath: null,
      defaultCurrency: "NGN",
    };
  }
  return ctx;
}
