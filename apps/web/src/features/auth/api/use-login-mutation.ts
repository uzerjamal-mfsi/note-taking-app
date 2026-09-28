import type { AuthResponseDto, LoginRequest } from "@note-taking-app/shared";
import { useAuthMutation } from "./create-auth-mutation.js";

export function useLoginMutation() {
  return useAuthMutation<AuthResponseDto, LoginRequest>("/auth/login");
}
