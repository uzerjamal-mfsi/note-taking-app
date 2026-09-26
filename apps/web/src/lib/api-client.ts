import type { ErrorResponse } from "@note-taking-app/shared";

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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw normalizeApiError(response.status, payload);
  }

  return (await response.json()) as T;
}
