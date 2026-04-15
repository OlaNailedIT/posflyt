import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ProtectedRoute from "../components/routing/ProtectedRoute";
import AdminRoute from "../components/routing/AdminRoute";
import PermissionRoute from "../components/routing/PermissionRoute";
import { VALIDATION_MODE } from "../config/productMode";
import OnboardingErrorBoundary from "../components/OnboardingErrorBoundary";
import RouteLoadingFallback from "../components/routing/RouteLoadingFallback.jsx";
import CatchAllRedirect from "../components/routing/CatchAllRedirect.jsx";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import InvitePage from "../pages/InvitePage";

const MarketingLayout = lazy(() => import("../components/marketing/MarketingLayout"));
const Home = lazy(() => import("../pages/Home"));
const About = lazy(() => import("../pages/About"));
const Pricing = lazy(() => import("../pages/Pricing"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Contact = lazy(() => import("../pages/Contact"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const PosPage = lazy(() => import("../pages/PosPage"));
const QuickSalesPage = lazy(() => import("../pages/QuickSalesPage"));
const ReturnsPage = lazy(() => import("../pages/ReturnsPage"));
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
const AdminSystemPage = lazy(() => import("../pages/AdminSystemPage"));
const BiDashboardPage = lazy(() => import("../pages/BiDashboardPage"));
const UsageInsightsPage = lazy(() => import("../pages/UsageInsightsPage"));
const FeaturesPage = lazy(() => import("../pages/FeaturesPage"));
const BlogIndex = lazy(() => import("../pages/BlogIndex"));
const BlogPostPage = lazy(() => import("../pages/BlogPostPage"));
const ReferralPage = lazy(() => import("../pages/ReferralPage"));
const GrowthKpiPage = lazy(() => import("../pages/GrowthKpiPage"));
const FinancialOpsPage = lazy(() => import("../pages/FinancialOpsPage"));

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
      <Route path="/invite/:token" element={<InvitePage />} />

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
        <Route
          path="/returns"
          element={
            <PermissionRoute permission="processReturns">
              <ReturnsPage />
            </PermissionRoute>
          }
        />
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
          path="/admin/system"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <AdminSystemPage />
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
          path="/admin/financial-ops"
          element={
            VALIDATION_MODE ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <AdminRoute>
                <FinancialOpsPage />
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

      <Route
        path="/terms"
        element={
          <Suspense fallback={<RouteLoadingFallback />}>
            <TermsPage />
          </Suspense>
        }
      />
      <Route
        path="/privacy"
        element={
          <Suspense fallback={<RouteLoadingFallback />}>
            <PrivacyPage />
          </Suspense>
        }
      />

      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  );
}
