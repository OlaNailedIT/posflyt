import AuthGuard from "../AuthGuard";

export default function ProtectedRoute({ children }) {
  return <AuthGuard>{children}</AuthGuard>;
}
