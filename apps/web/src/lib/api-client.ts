import type { ErrorResponse } from "@note-taking-app/shared";
import { useSessionStore } from "../store/session-store.js";

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function isErrorResponse(payload: unknown): payload is ErrorResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).code === "string" &&
    typeof (payload as Record<string, unknown>).message === "string"
  );
}

export function normalizeApiError(status: number, payload: unknown): NormalizedApiError {
  if (isErrorResponse(payload)) {
    return {
      status,
      code: payload.code,
      message: payload.message,
      details: payload.details,
    };
  }

  return {
    status,
    code: "UNKNOWN_ERROR",
    message: "Something went wrong",
    details: undefined,
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface ApiFetchOptions {
  /**
   * Skip the 401-refresh-and-retry path. Auth endpoints (login, register, refresh
   * itself, logout, forgot-password, reset-password) must pass this: their own
   * 401s reflect invalid credentials or an invalid OTP, never an expired access
   * token, so attempting a refresh there is never correct.
   */
  skipRefresh?: boolean;
  /**
   * Public endpoints (e.g. GET /shared/:token): send no access token and never attempt
   * a session refresh, since a public route never legitimately 401s for an expired session.
   */
  skipAuth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (!options.skipAuth) {
    const { accessToken } = useSessionStore.getState();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (response.status === 401 && !options.skipRefresh && !options.skipAuth) {
    const refreshedToken = await refreshSession();
    if (refreshedToken) {
      return apiFetch<T>(path, init, { skipRefresh: true });
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw normalizeApiError(response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

let inFlightRefresh: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      useSessionStore.getState().clearSession();
      return null;
    }

    // The refresh endpoint returns only a new access token, never user info
    // (see apps/api/src/routes/auth-router.ts), so the existing in-memory user
    // (set at login/register) is preserved rather than overwritten.
    const payload = (await response.json()) as { accessToken: string };
    const { user } = useSessionStore.getState();
    useSessionStore.setState({ status: "authenticated", user, accessToken: payload.accessToken });
    return payload.accessToken;
  } catch {
    useSessionStore.getState().clearSession();
    return null;
  }
}
