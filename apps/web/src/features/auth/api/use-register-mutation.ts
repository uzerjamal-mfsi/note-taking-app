import type { AuthResponseDto, RegisterRequest } from "@note-taking-app/shared";
import { useAuthMutation } from "./create-auth-mutation.js";

export function useRegisterMutation() {
  return useAuthMutation<AuthResponseDto, RegisterRequest>("/auth/register");
}
