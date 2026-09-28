import { Navigate, Outlet, useLocation } from "react-router";
import { useSessionStore } from "../store/session-store.js";

export function RequireAuth() {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();

  if (status !== "authenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
