import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

export default function AdminRoute({ children }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  return children;
}
