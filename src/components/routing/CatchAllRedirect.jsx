import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { getStoredAuthTokenSync } from "../../utils/authToken";

/**
 * Unknown paths: send authenticated users to app home; others to marketing home.
 */
export default function CatchAllRedirect() {
  const tokenFromStore = useAuthStore((s) => s.token);
  const token = tokenFromStore || getStoredAuthTokenSync();
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/" replace />;
}
