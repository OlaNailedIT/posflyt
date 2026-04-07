import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import AdminRoute from "./components/routing/AdminRoute";
import PermissionRoute from "./components/routing/PermissionRoute";
import { VALIDATION_MODE } from "./config/productMode";
import OnboardingErrorBoundary from "./components/OnboardingErrorBoundary";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const PosPage = lazy(() => import("./pages/PosPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const BillingReturnPage = lazy(() => import("./pages/BillingReturnPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const BackupsPage = lazy(() => import("./pages/BackupsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-stone-500 dark:text-stone-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" aria-hidden />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/ng" element={<LandingPage />} />
        <Route path="/za" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/customers" element={<CustomersPage />} />
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
    </Suspense>
  );
}
