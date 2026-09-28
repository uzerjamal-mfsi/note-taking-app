import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session-store";
import { useLogoutMutation } from "../api/use-logout-mutation.js";

export function LogoutButton() {
  const navigate = useNavigate();
  const clearSession = useSessionStore((state) => state.clearSession);
  const mutation = useLogoutMutation();

  function handleLogout() {
    mutation.mutate(undefined, {
      onSettled: () => {
        clearSession();
        navigate("/login", { replace: true });
      },
    });
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={mutation.isPending}>
      Log out
    </Button>
  );
}
