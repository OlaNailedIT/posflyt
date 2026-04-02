import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { can } from "../../utils/permissions";

export default function PermissionRoute({ permission, children }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!can(role, permission)) return <Navigate to="/dashboard" replace />;
  return children;
}
