import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/health-api.js";

export function useHealthQuery() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });
}
