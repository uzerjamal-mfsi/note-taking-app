import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "../api/tags-api.js";

export function useTagsQuery() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });
}
