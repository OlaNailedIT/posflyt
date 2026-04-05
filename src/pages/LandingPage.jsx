import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import Features from "../components/landing/Features";
import ProductMockupsSection from "../components/landing/ProductMockupsSection";
import ProductWorkflowSection from "../components/landing/ProductWorkflowSection";
import TrustSignalsSection from "../components/landing/TrustSignalsSection";
import DashboardPreview from "../components/landing/DashboardPreview";
import Pricing from "../components/landing/Pricing";
import Footer from "../components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 via-amber-50/40 to-stone-200 text-stone-900 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 dark:text-stone-100">
      <Navbar />
      <Hero />
      <Features />
      <ProductMockupsSection />
      <ProductWorkflowSection />
      <TrustSignalsSection />
      <DashboardPreview />
      <Pricing />
      <Footer />
    </div>
  );
}
