import { apiFetch } from "../../../lib/api-client.js";

export interface HealthStatus {
  status: "ok";
}

export function fetchHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>("/health");
}
