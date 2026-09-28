import type { AuthAckResponse } from "@note-taking-app/shared";
import { useAuthMutation } from "./create-auth-mutation.js";

export function useLogoutMutation() {
  return useAuthMutation<AuthAckResponse>("/auth/logout");
}
