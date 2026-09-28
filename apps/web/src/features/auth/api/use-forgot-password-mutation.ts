import type { AuthAckResponse, ForgotPasswordRequest } from "@note-taking-app/shared";
import { useAuthMutation } from "./create-auth-mutation.js";

export function useForgotPasswordMutation() {
  return useAuthMutation<AuthAckResponse, ForgotPasswordRequest>("/auth/forgot-password");
}
