import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import RouteLoadingFallback from "../routing/RouteLoadingFallback.jsx";
import Navbar from "../landing/Navbar";
import Footer from "../Footer";
import StickyCtaBar from "./StickyCtaBar";
import JsonLdOrganization from "../seo/JsonLdOrganization";

export default function MarketingLayout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 via-amber-50/40 to-stone-200 text-stone-900 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 dark:text-stone-100">
      <JsonLdOrganization />
      <header>
        <Navbar />
      </header>
      <main id="main-content" className="pb-28 md:pb-32">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <StickyCtaBar />
    </div>
  );
}
