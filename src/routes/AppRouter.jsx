import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ProtectedRoute from "../components/routing/ProtectedRoute";
import AdminRoute from "../components/routing/AdminRoute";
import PermissionRoute from "../components/routing/PermissionRoute";
import { VALIDATION_MODE } from "../config/productMode";
import OnboardingErrorBoundary from "../components/OnboardingErrorBoundary";

const MarketingLayout = lazy(() => import("../components/marketing/MarketingLayout"));
const Home = lazy(() => import("../pages/Home"));
const About = lazy(() => import("../pages/About"));
const Pricing = lazy(() => import("../pages/Pricing"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Contact = lazy(() => import("../pages/Contact"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const RegisterPage = lazy(() => import("../pages/RegisterPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const PosPage = lazy(() => import("../pages/PosPage"));
const QuickSalesPage = lazy(() => import("../pages/QuickSalesPage"));
const InventoryPage = lazy(() => import("../pages/InventoryPage"));
const InventoryCountPage = lazy(() => import("../pages/InventoryCountPage"));
const CustomersPage = lazy(() => import("../pages/CustomersPage"));
const ExpensesPage = lazy(() => import("../pages/ExpensesPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const OnboardingPage = lazy(() => import("../pages/OnboardingPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const BillingPage = lazy(() => import("../pages/BillingPage"));
const BillingReturnPage = lazy(() => import("../pages/BillingReturnPage"));
const AuditLogsPage = lazy(() => import("../pages/AuditLogsPage"));
const BackupsPage = lazy(() => import("../pages/BackupsPage"));
const HelpPage = lazy(() => import("../pages/HelpPage"));
const TermsPage = lazy(() => import("../pages/TermsPage"));
const PrivacyPage = lazy(() => import("../pages/PrivacyPage"));
const StaffPage = lazy(() => import("../pages/StaffPage"));
const AdminMonitoringPage = lazy(() => import("../pages/AdminMonitoringPage"));
const BiDashboardPage = lazy(() => import("../pages/BiDashboardPage"));
const UsageInsightsPage = lazy(() => import("../pages/UsageInsightsPage"));
const FeaturesPage = lazy(() => import("../pages/FeaturesPage"));
const BlogIndex = lazy(() => import("../pages/BlogIndex"));
const BlogPostPage = lazy(() => import("../pages/BlogPostPage"));
const ReferralPage = lazy(() => import("../pages/ReferralPage"));
const GrowthKpiPage = lazy(() => import("../pages/GrowthKpiPage"));

/**
 * All application routes. `BrowserRouter` lives in `main.jsx`.
 * Public marketing dashboard: `/features/dashboard`. Authenticated app: `/dashboard`.
 */
export default function AppRouter() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/ng" element={<Home />} />
        <Route path="/za" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/features/dashboard" element={<Dashboard />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/refer" element={<ReferralPage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/usage" element={<UsageInsightsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/pos/quick" element={<QuickSalesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route
          path="/inventory/count"
          element={
            <PermissionRoute permission="editProducts">
              <InventoryCountPage />
            </PermissionRoute>
          }
        />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route
          path="/onboarding"
          element={
            <OnboardingErrorBoundary>
              <OnboardingPage />
            </OnboardingErrorBoundary>
          }
        />
        <Route
          path="/staff"
          element={
            <AdminRoute>
              <StaffPage />
            </AdminRoute>
          }
        />
        <Route
          path="/reports"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <PermissionRoute permission="viewReports">
                <ReportsPage />
              </PermissionRoute>
            )
          }
        />
        <Route
          path="/bi"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <PermissionRoute permission="viewReports">
                <BiDashboardPage />
              </PermissionRoute>
            )
          }
        />
        <Route
          path="/settings"
          element={
            <PermissionRoute permission="accessSettings">
              <SettingsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/billing"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <BillingPage />
              </AdminRoute>
            )
          }
        />
        <Route
          path="/billing/return"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <BillingReturnPage />
              </AdminRoute>
            )
          }
        />
        <Route
          path="/audit-logs"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <AuditLogsPage />
              </AdminRoute>
            )
          }
        />
        <Route
          path="/admin/monitoring"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <AdminMonitoringPage />
              </AdminRoute>
            )
          }
        />
        <Route
          path="/admin/growth"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <GrowthKpiPage />
              </AdminRoute>
            )
          }
        />
        <Route
          path="/backups"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <BackupsPage />
              </AdminRoute>
            )
          }
        />
        <Route path="/help" element={<HelpPage />} />
      </Route>

      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
