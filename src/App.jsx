import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import PosPage from "./pages/PosPage";
import InventoryPage from "./pages/InventoryPage";
import CustomersPage from "./pages/CustomersPage";
import ReportsPage from "./pages/ReportsPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import AdminRoute from "./components/routing/AdminRoute";
import PermissionRoute from "./components/routing/PermissionRoute";
import SettingsPage from "./pages/SettingsPage";
import BillingPage from "./pages/BillingPage";
import BillingReturnPage from "./pages/BillingReturnPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import BackupsPage from "./pages/BackupsPage";
import HelpPage from "./pages/HelpPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import StaffPage from "./pages/StaffPage";
import { VALIDATION_MODE } from "./config/productMode";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
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
        <Route path="/onboarding" element={<OnboardingPage />} />
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
  );
}
