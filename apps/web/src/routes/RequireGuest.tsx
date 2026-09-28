import { Navigate, Outlet } from "react-router";
import { useSessionStore } from "../store/session-store.js";

export function RequireGuest() {
  const status = useSessionStore((state) => state.status);

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
