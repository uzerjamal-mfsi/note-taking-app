import type { AuthAckResponse, ResetPasswordRequest } from "@note-taking-app/shared";
import { useAuthMutation } from "./create-auth-mutation.js";

export function useResetPasswordMutation() {
  return useAuthMutation<AuthAckResponse, ResetPasswordRequest>("/auth/reset-password");
}
