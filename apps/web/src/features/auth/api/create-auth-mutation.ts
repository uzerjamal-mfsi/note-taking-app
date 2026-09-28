import { useMutation } from "@tanstack/react-query";
import { apiFetch, type NormalizedApiError } from "../../../lib/api-client.js";

/**
 * Shared factory for the auth endpoints: each is a POST to `path` that must
 * never trigger apiFetch's refresh-and-retry path (a 401 here means invalid
 * credentials or an invalid OTP, not an expired access token).
 */
export function useAuthMutation<TResponse, TRequest = void>(path: string) {
  return useMutation<TResponse, NormalizedApiError, TRequest>({
    mutationFn: (payload) =>
      apiFetch<TResponse>(
        path,
        {
          method: "POST",
          ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        },
        { skipRefresh: true },
      ),
  });
}
